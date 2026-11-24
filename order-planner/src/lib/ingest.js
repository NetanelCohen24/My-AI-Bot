/**
 * Reads the company's inventory workbook as-is.
 *
 * Sheets are recognised by their header row, not by name, so renamed / reordered sheets still work:
 *   • Stock by batch    – material/SKU + expiry + unrestricted stock (one row per batch, any order)
 *   • Sales history     – SKU + one column per month (cases). Several such sheets are merged.
 *   • Product master    – SKU + lead time / cases per pallet / supplier / min stock / shelf life
 * Everything is in cases (תיבות), like the original file.
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/["'׳״`\s_\-./\\()*:<>]/g, '');

const F = {
  sku: ['חומר', 'מקטטמפו', 'מקט', 'sku', 'material', 'קודפריט'],
  name: ['תיאורחומר', 'שםפריט', 'תאורמוצר', 'תיאורמוצר', 'שםהמוצר', 'שםמוצר', 'תיאור', 'description', 'name'],
  expiry: ['תאריךפגתוקף', 'פגתוקף', 'תוקף', 'expiry', 'expirationdate', 'bbd'],
  qty: ['בלתימוגבל', 'מלאיבתיבות', 'כמותבתיבות', 'מלאי', 'unrestricted', 'stock', 'qty'],
  unitsPerCase: ['יחבתיבה', 'כמותיחבתיבתמכר', 'יחידותבתיבה', 'unitspercase'],
  barcode: ['ברקוד', 'barcode', 'ean'],
  avgMonthly: ['מכרממוצעלחודשתיבות', 'מכרממוצעלחודש', 'ממוצעתיבותחודשי', 'ממוצעחודשי'],
  blockDays: ['מסימיםלחסימתמוצרלפניתוםתוקף', 'ימיםלחסימה'],
  supplier: ['ספק', 'supplier', 'vendor'],
  origin: ['יצורמקומייבוא', 'מקומייבוא', 'יבואמקומי', 'origin'],
  country: ['ארץיצוריבוא', 'ארץיצור', 'country'],
  leadDays: ['leadtimeלהזמנה', 'leadtime', 'זמןאספקה'],
  minCases: ['כמותמינימוםבתיבותבמחסןמלאיבטחון', 'כמותמינימוםבמחסןתיבות', 'כמותמינימום', 'מלאיבטחון', 'minimum'],
  casesPerPallet: ['כמותתיבותבמשטחבמחסן', 'תיבותבמשטח', 'casesperpallet'],
  shelfLifeDays: ['חייםמדףבימים', 'חיימדףבימים', 'shelflifedays'],
  shelfLifeMonths: ['חיימדףחוד', 'חיימדף'],
  brand: ['מותג', 'brand'],
  abc: ['abc', 'תיעדוףזמינותמוצרים'],
  price: ['מחירון', 'מחיר', 'price'],
};

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "YYYY-MM" for month-like headers (Date, Excel serial, "Jan-25", "01/2025", "ינואר 25"), else null. */
export function monthKey(h) {
  if (h instanceof Date && !isNaN(h)) {
    // xlsx gives local-midnight dates; add 12h before reading to dodge TZ edges.
    const d = new Date(h.getTime() + 12 * 3600000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof h === 'number' && h > 30000 && h < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + h * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const s = String(h ?? '').trim().toLowerCase();
  if (!s || s.length > 16) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4}|\d{2})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${m[1].padStart(2, '0')}`;
  m = s.match(/^([a-z]{3})[a-z]*[-\s']*(\d{2}|\d{4})$/);
  if (m && EN_MONTHS.includes(m[1])) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${String(EN_MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}`;
  const hi = HE_MONTHS.findIndex((x) => s.startsWith(x));
  m = s.match(/(\d{2}|\d{4})$/);
  if (hi >= 0 && m) return `${m[1].length === 2 ? '20' + m[1] : m[1]}-${String(hi + 1).padStart(2, '0')}`;
  return null;
}

export function toISO(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 12 * 3600000).toISOString().slice(0, 10);
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[,₪$\s]/g, '');
  if (s === '-' || s === '') return 0;
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
};
const has = (v) => v !== '' && v != null && String(v).trim() !== '' && String(v).trim() !== '0';
const str = (v) => String(v ?? '').trim().replace(/\.0+$/, '');

/** Find the header row (within the first 12) that matches the most known fields. */
function findHeader(rows) {
  let best = { idx: -1, score: 0, map: {} };
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const map = mapRow(rows[i] || []);
    const months = (rows[i] || []).filter((h) => monthKey(h)).length;
    const score = Object.keys(map).length + Math.min(months, 6) * 0.5;
    if (score > best.score) best = { idx: i, score, map, months };
  }
  return best;
}
function mapRow(row) {
  const used = new Set();
  const map = {};
  for (const [field, aliases] of Object.entries(F)) {
    for (const pass of [0, 1]) {
      if (map[field] != null) break;
      for (const a of aliases) {
        const j = row.findIndex((h, k) => !used.has(k) && !monthKey(h) && (pass ? norm(h).includes(a) && a.length >= 3 : norm(h) === a));
        if (j >= 0) { map[field] = j; used.add(j); break; }
      }
    }
  }
  return map;
}

/**
 * @param sheets [{ name, rows: any[][] }]  (header:1 arrays, raw values, cellDates)
 * @returns { products: Product[], meta, issues }
 */
export function ingest(sheets) {
  const issues = [];
  const products = new Map();
  const P = (sku) => {
    if (!products.has(sku)) products.set(sku, { sku, name: '', batches: [], history: {}, promos: {} });
    return products.get(sku);
  };
  const meta = { stockSheet: null, historySheets: [], masterSheet: null, batches: 0 };

  const classified = sheets.map((sh) => {
    const h = findHeader(sh.rows);
    const m = h.map;
    let kind = null;
    if (m.sku != null && m.expiry != null && m.qty != null) kind = 'stock';
    else if (m.sku != null && h.months >= 3) kind = 'history';
    else if (m.sku != null && (m.leadDays != null || m.casesPerPallet != null)) kind = 'master';
    return { ...sh, h, kind };
  });

  // 1) Product master first (defaults), 2) history, 3) stock (most authoritative for names & batches).
  for (const sh of classified.filter((s) => s.kind === 'master')) {
    meta.masterSheet = meta.masterSheet || sh.name;
    const m = sh.h.map;
    for (const r of sh.rows.slice(sh.h.idx + 1)) {
      const sku = str(r[m.sku]);
      if (!/^\w+$/.test(sku)) continue;
      const p = P(sku);
      if (m.name != null && !p.name) p.name = str(r[m.name]);
      for (const k of ['supplier', 'origin', 'country', 'brand', 'barcode']) if (m[k] != null && has(r[m[k]]) && !p[k]) p[k] = str(r[m[k]]);
      for (const k of ['leadDays', 'minCases', 'casesPerPallet', 'shelfLifeDays', 'unitsPerCase', 'price']) if (m[k] != null && has(r[m[k]]) && p[k] == null) p[k] = num(r[m[k]]);
    }
  }

  const historyMonths = new Set();
  for (const sh of classified.filter((s) => s.kind === 'history')) {
    meta.historySheets.push(sh.name);
    const m = sh.h.map;
    const header = sh.rows[sh.h.idx];
    const cols = header.map((h, j) => ({ j, k: monthKey(h) })).filter((c) => c.k);
    for (const r of sh.rows.slice(sh.h.idx + 1)) {
      const sku = str(r[m.sku]);
      if (!/^\w+$/.test(sku)) continue;
      const p = P(sku);
      if (m.name != null && !p.name) p.name = str(r[m.name]);
      if (m.brand != null && has(r[m.brand]) && !p.brand) p.brand = str(r[m.brand]);
      for (const c of cols) {
        const v = r[c.j];
        if (v === '' || v == null) continue;
        // Later sheets override earlier ones for the same month (newer exports win).
        p.history[c.k] = num(v);
        historyMonths.add(c.k);
      }
    }
  }

  // Exactly one stock sheet: the largest one (other sheets with expiry + qty are usually old reports).
  const stockSheets = classified.filter((s) => s.kind === 'stock').sort((a, b) => b.rows.length - a.rows.length);
  if (stockSheets.length > 1) meta.ignoredStockSheets = stockSheets.slice(1).map((s) => s.name);
  for (const sh of stockSheets.slice(0, 1)) {
    meta.stockSheet = meta.stockSheet || sh.name;
    const m = sh.h.map;
    const seen = new Set();
    for (const r of sh.rows.slice(sh.h.idx + 1)) {
      const sku = str(r[m.sku]);
      if (!/^\w+$/.test(sku)) continue;
      const p = P(sku);
      if (m.name != null && has(r[m.name])) p.name = str(r[m.name]);
      const qty = num(r[m.qty]);
      if (qty > 0) { p.batches.push({ expiry: toISO(r[m.expiry]), qty }); meta.batches++; }
      if (seen.has(sku)) continue;
      seen.add(sku);
      for (const k of ['supplier', 'origin', 'country', 'brand', 'barcode', 'abc']) if (m[k] != null && has(r[m[k]])) p[k] = str(r[m[k]]);
      for (const k of ['leadDays', 'minCases', 'unitsPerCase', 'blockDays', 'avgMonthly']) if (m[k] != null && has(r[m[k]])) p[k] = num(r[m[k]]);
      if (m.shelfLifeMonths != null && has(r[m.shelfLifeMonths]) && !p.shelfLifeDays) p.shelfLifeDays = num(r[m.shelfLifeMonths]) * 30;
    }
  }

  if (!meta.stockSheet) issues.push('לא נמצא גיליון מלאי לפי אצוות (עמודות חומר/מק״ט, תאריך פג תוקף, כמות/בלתי-מוגבל).');
  if (!meta.historySheets.length) issues.push('לא נמצא גיליון מכר חודשי – החיזוי ישתמש בעמודת "מכר ממוצע לחודש" בלבד.');

  // Keep products that have stock, sales or are in the stock sheet.
  const list = [...products.values()].filter((p) => p.batches.length || Object.values(p.history).some((x) => x > 0) || p.avgMonthly > 0);
  for (const p of list) {
    if (!p.name) p.name = p.sku;
    if (p.origin === '0') p.origin = '';
    if (p.supplier === '0') p.supplier = '';
    if (p.abc === '0') p.abc = '';
  }
  meta.months = [...historyMonths].sort();
  // Last month with real sales (export sheets often pre-fill future months with "-" = 0).
  const totals = meta.months.map((mk) => [mk, list.reduce((s, p) => s + Math.max(0, p.history[mk] || 0), 0)]);
  const nz = totals.filter(([, v]) => v > 0).map(([, v]) => v).sort((a, b) => a - b);
  const median = nz.length ? nz[Math.floor(nz.length / 2)] : 0;
  const real = totals.filter(([, v]) => v > median * 0.15);
  meta.salesEnd = real.length ? real.at(-1)[0] : null;
  if (meta.salesEnd) {
    const [y, mo] = meta.salesEnd.split('-').map(Number);
    meta.defaultAsOf = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10); // 1st of the following month
  }
  return { products: list, meta, issues };
}

export async function readWorkbook(buf) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, dense: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // Guard against sheets with a million empty formatted rows.
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
    return { name, rows: rows.slice(0, 20000) };
  });
}

export function googleExportUrl(link) {
  const s = link.trim();
  let m = s.match(/docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)/);
  if (m) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=xlsx`;
  m = s.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (m) return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`;
  return s;
}

export async function exportXlsx(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(10, String(k).length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
