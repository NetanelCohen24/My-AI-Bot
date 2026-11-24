/**
 * Storage backends. Both expose the same tiny API so the app doesn't care where data lives:
 *   loadAll() → { table: rows[] }
 *   insert(table, rows[]) → rows[]   (ids assigned)
 *   update(table, id, patch) → row
 *   remove(table, id)
 *   subscribe(onChange(table)) → unsubscribe
 */
export const TABLES = ['products', 'suppliers', 'customers', 'lots', 'movements', 'orders', 'order_lines', 'purchase_orders', 'po_lines'];

export const emptyDb = () => Object.fromEntries(TABLES.map((t) => [t, []]));

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/* ───────────── Local (browser) ───────────── */
const LS_KEY = 'depot.db.v1';

export function localBackend() {
  const read = () => {
    try { return { ...emptyDb(), ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } catch { return emptyDb(); }
  };
  let data = read();
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota / private mode */ } };
  const listeners = new Set();
  // Cross-tab sync: another tab wrote → reload.
  const onStorage = (e) => { if (e.key === LS_KEY) { data = read(); listeners.forEach((l) => l('*')); } };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return {
    kind: 'local',
    user: { email: '' },
    async loadAll() { data = read(); return structuredClone(data); },
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
      data[table].push(...out);
      save();
      return out;
    },
    async update(table, id, patch) {
      const i = data[table].findIndex((r) => r.id === id);
      if (i < 0) throw new Error('הרשומה לא נמצאה');
      data[table][i] = { ...data[table][i], ...patch };
      save();
      return data[table][i];
    },
    async remove(table, id) { data[table] = data[table].filter((r) => r.id !== id); save(); },
    async replaceAll(next) { data = { ...emptyDb(), ...next }; save(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async signOut() {},
  };
}

/* ───────────── Supabase (multi-user) ───────────── */
export async function supabaseBackend(client, session) {
  const sb = client;
  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const listeners = new Set();
  const channel = sb.channel('depot-all');
  for (const t of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => listeners.forEach((l) => l(t)));
  }
  channel.subscribe();

  async function fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await sb.from(table).select('*').range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  return {
    kind: 'supabase',
    user: session.user,
    async loadAll() {
      const entries = await Promise.all(TABLES.map(async (t) => [t, await fetchAll(t)]));
      return Object.fromEntries(entries);
    },
    async loadTable(t) { return fetchAll(t); },
    async insert(table, rows) {
      const stamped = rows.map((r) => ({ id: uid(), ...r }));
      const out = [];
      for (let i = 0; i < stamped.length; i += 500) out.push(...check(await sb.from(table).insert(stamped.slice(i, i + 500)).select()));
      return out;
    },
    async update(table, id, patch) { return check(await sb.from(table).update(patch).eq('id', id).select().single()); },
    async remove(table, id) { check(await sb.from(table).delete().eq('id', id)); },
    async replaceAll() { throw new Error('איפוס מלא אינו זמין במסד נתונים משותף'); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async signOut() { sb.removeChannel(channel); await sb.auth.signOut(); },
  };
}

/* Connection config: build-time env vars win, else what the user typed in Settings. */
const CFG_KEY = 'depot.supabase';
export function getSupabaseConfig() {
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (url && key) return { url, key, source: 'env' };
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (c?.url && c?.key) return { ...c, source: 'local' };
  } catch { /* ignore */ }
  return null;
}
export function setSupabaseConfig(cfg) {
  if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); else localStorage.removeItem(CFG_KEY);
}
