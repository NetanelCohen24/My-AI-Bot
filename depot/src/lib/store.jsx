import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { emptyDb } from './backend.js';
import { stockSummary, todayISO } from './inventory.js';
import { useToast } from '../components/ui.jsx';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

export function DataProvider({ backend, children }) {
  const [db, setDb] = useState(emptyDb);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const dbRef = useRef(db);
  dbRef.current = db;

  const reload = useCallback(async () => {
    const next = await backend.loadAll();
    setDb(next);
    setLoading(false);
    return next;
  }, [backend]);

  useEffect(() => {
    reload().catch((e) => { toast('err', `טעינת נתונים נכשלה: ${e.message}`); setLoading(false); });
    // Debounced refresh on remote changes (other users / tabs).
    let t;
    const off = backend.subscribe(() => { clearTimeout(t); t = setTimeout(() => reload().catch(() => {}), 400); });
    return () => { off(); clearTimeout(t); };
  }, [backend, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Run a business op against a fresh snapshot, then reload. */
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn(dbRef.current, backend);
      await reload();
      if (okMsg) toast('ok', typeof okMsg === 'function' ? okMsg(res) : okMsg);
      return res;
    } catch (e) {
      toast('err', e.message || String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [backend, reload, toast]);

  const today = todayISO();
  const summary = useMemo(() => stockSummary(db, today), [db, today]);
  const idx = useMemo(() => ({
    product: new Map(db.products.map((p) => [p.id, p])),
    customer: new Map(db.customers.map((c) => [c.id, c])),
    supplier: new Map(db.suppliers.map((s) => [s.id, s])),
    lot: new Map(db.lots.map((l) => [l.id, l])),
    stock: new Map(summary.map((s) => [s.product.id, s])),
  }), [db, summary]);

  const value = useMemo(() => ({ db, be: backend, reload, run, busy, loading, summary, idx, today }), [db, backend, reload, run, busy, loading, summary, idx, today]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
