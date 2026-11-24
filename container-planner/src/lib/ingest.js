/**
 * Reads the importer's own Excel (or a published Google Sheet) into { items, incoming }.
 * Column names are matched loosely in Hebrew/English. Monthly sales can be given either as
 * one "average per month" column or as a column per month (e.g. "01/2026", "ינואר 26", "Jan-26").
 */
const norm = (s) => String(s ?? '').toLowerCase().replace(/["'׳״`\s_\-./\\()*:]/g, '');

const ITEM_FIELDS = {
  sku: ['מקט', 'sku', 'קודפריט', 'פריט', 'itemcode', 'code', 'ברקוד', 'barcode'],
  name: ['שםמוצר', 'תיאור', 'שםפריט', 'name', 'description', 'product', 'מוצר'],
  supplier: ['ספק', 'supplier', 'vendor', 'יצרן', 'factory'],
  stock: ['מלאינוכחי', 'יתרה', 'מלאי', 'stock', 'onhand', 'inventory', 'כמותבמלאי', 'qty'],
  avgMonthly: ['ממוצעחודשי', 'מכירותחודשיות', 'מכירהחודשית', 'avgmonthly', 'monthlysales', 'צריכהחודשית'],
  leadDays: ['זמןאספקה', 'ימיאספקה', 'leadtime', 'lead', 'ימיםעדהגעה'],
  unitsPerCarton: ['יחבקרטון', 'יחידותבקרטון', 'יחלקרטון', 'unitspercarton', 'upc', 'pcsctn', 'אריזה'],
  cbmPerCarton: ['נפחקרטון', 'קובלקרטון', 'cbmpercarton', 'cbm', 'קוב', 'נפח'],
  moq: ['מינימוםהזמנה', 'moq', 'כמותמינימום'],
  cost: ['עלות', 'cost', 'מחירקנייה', 'fob'],
  price: ['מחירמכירה', 'price', 'מחיר'],
  incomingQty: ['בדרך', 'כמותבדרך', 'incoming', 'onorder', 'intransit'],
  incomingEta: ['תאריךהגעה', 'eta', 'הגעה', 'arrival'],
};
const INC_FIELDS = {
  sku: ITEM_FIELDS.sku,
  qty: ['כמות', 'qty', 'quantity', 'units'],
  eta: ['תאריךהגעה', 'eta', 'הגעה', 'arrival', 'תאריך'],
  ref: ['מכולה', 'container', 'הזמנה', 'po', 'אסמכתא'],
};

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Returns a sortable month key "YYYY-MM" if the header looks like a month, else null. */
export function monthKey(h) {
  if (h instanceof Date && !isNaN(h)) return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
  const s = String(h).trim().toLowerCase();
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m && +m[1] <= 12) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${m[1].padStart(2, '0')}`;
  const y = s.match(/(\d{4}|\d{2})\s*$/);
  if (!y) return null;
  const yr = y[1].length === 2 ? `20${y[1]}` : y[1];
  const hi = HE_MONTHS.findIndex((x) => s.includes(x));
  if (hi >= 0) return `${yr}-${String(hi + 1).padStart(2, '0')}`;
  const ei = EN_MONTHS.findIndex((x) => s.startsWith(x) || s.includes(` ${x}`) || s.includes(`-${x}`));
  if (ei >= 0) return `${yr}-${String(ei + 1).padStart(2, '0')}`;
  return null;
}

function mapFields(headers, spec) {
  const used = new Set();
  const m = {};
  for (const [field, aliases] of Object.entries(spec)) {
    for (const pass of [0, 1]) {
      if (m[field]) break;
      const hit = headers.find((h) => !used.has(h) && monthKey(h) == null && aliases.some((a) => (pass ? norm(h).includes(a) : norm(h) === a)));
      if (hit) { m[field] = hit; used.add(hit); }
    }
  }
  return m;
}

const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[,₪$\s]/g, ''));
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => {
  let s = String(v ?? '').trim();
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) s = BigInt(Math.round(Number(s))).toString();
  return s.replace(/\.0+$/, '');
};
export function toISO(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** sheets: [{ name, rows: [{header: value}] }] */
export function ingestSheets(sheets) {
  const issues = [];
  // Main sheet = the one with the most rows that maps sku + stock.
  let main = null;
  let mainMap = null;
  for (const sh of sheets) {
    if (!sh.rows.length) continue;
    const m = mapFields(Object.keys(sh.rows[0]), ITEM_FIELDS);
    if (m.sku && m.stock && (!main || sh.rows.length > main.rows.length)) { main = sh; mainMap = m; }
  }
  if (!main) return { items: [], incoming: [], issues: ['לא נמצא גיליון עם עמודות מק״ט ומלאי. השתמשו בתבנית או ודאו שיש שורת כותרות.'], meta: {} };

  const headers = Object.keys(main.rows[0]);
  const months = headers.map((h) => ({ h, k: monthKey(h) })).filter((x) => x.k).sort((a, b) => a.k.localeCompare(b.k));
  if (!months.length && !mainMap.avgMonthly) issues.push('לא נמצאו עמודות מכירות (חודשים או ממוצע חודשי) – לא ניתן לחזות.');

  const items = [];
  const incoming = [];
  for (const r of main.rows) {
    const sku = str(r[mainMap.sku]);
    if (!sku) continue;
    const it = {
      sku, name: str(r[mainMap.name]) || sku, supplier: str(r[mainMap.supplier]) || 'ללא ספק',
      stock: num(r[mainMap.stock]),
      history: months.map((m) => num(r[m.h])),
      avgMonthly: mainMap.avgMonthly ? num(r[mainMap.avgMonthly]) : null,
    };
    for (const k of ['leadDays', 'unitsPerCarton', 'cbmPerCarton', 'moq', 'cost', 'price']) if (mainMap[k] && str(r[mainMap[k]])) it[k] = num(r[mainMap[k]]);
    items.push(it);
    if (mainMap.incomingQty && num(r[mainMap.incomingQty]) > 0) {
      const eta = toISO(r[mainMap.incomingEta]);
      if (eta) incoming.push({ sku, qty: num(r[mainMap.incomingQty]), eta, ref: '' });
      else issues.push(`${sku}: יש כמות בדרך בלי תאריך הגעה – לא נכלל`);
    }
  }

  // Optional second sheet with containers on the way.
  for (const sh of sheets) {
    if (sh === main || !sh.rows.length) continue;
    const m = mapFields(Object.keys(sh.rows[0]), INC_FIELDS);
    if (!(m.sku && m.qty && m.eta)) continue;
    for (const r of sh.rows) {
      const sku = str(r[m.sku]); const eta = toISO(r[m.eta]);
      if (sku && eta && num(r[m.qty]) > 0) incoming.push({ sku, qty: num(r[m.qty]), eta, ref: m.ref ? str(r[m.ref]) : '' });
    }
  }
  return {
    items, incoming, issues,
    meta: { sheet: main.name, months: months.map((m) => m.k), mapped: mainMap },
  };
}

export async function readWorkbook(buf) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) }));
}

/** Accepts a normal Google Sheets link and turns it into an xlsx export URL. */
export function googleExportUrl(link) {
  const s = link.trim();
  let m = s.match(/docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)/);
  if (m) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=xlsx`;
  m = s.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (m) return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`;
  return s;
}

export async function fetchSheet(link) {
  const url = googleExportUrl(link);
  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch {
    throw new Error('לא הצלחתי לקרוא את הגיליון. ודאו שהוא פורסם לרשת (קובץ ← שיתוף ← פרסום באינטרנט) או ששיתוף מוגדר "כל מי שיש לו את הקישור".');
  }
  if (!res.ok) throw new Error(`הגיליון החזיר שגיאה ${res.status}. ודאו שהשיתוף פתוח לצפייה לכל מי שיש לו את הקישור.`);
  return readWorkbook(await res.arrayBuffer());
}

export async function exportXlsx(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(10, String(k).length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
