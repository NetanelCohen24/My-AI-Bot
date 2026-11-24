/** Excel import/export helpers (SheetJS loaded lazily). */
const norm = (s) => String(s ?? '').toLowerCase().replace(/["'׳״`\s_\-./\\()*]/g, '');

export async function exportXlsx(filename, rows, sheet = 'Sheet1') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(10, k.length + 2) }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename);
}

export async function readSheet(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
}

/** Import kinds: field → header aliases (normalised). First alias is the template header. */
export const IMPORT_KINDS = {
  products: {
    label: 'מוצרים + יתרות פתיחה',
    fields: {
      sku: ['מק״ט', 'מקט', 'sku', 'קודפריט', 'itemcode'],
      name: ['שם מוצר', 'שםמוצר', 'תיאור', 'name', 'product'],
      barcode: ['ברקוד', 'barcode', 'ean'],
      category: ['קטגוריה', 'category', 'מחלקה'],
      unit: ['יחידה', 'unit', 'יחידתמידה'],
      cost: ['מחיר עלות', 'עלות', 'cost'],
      price: ['מחיר מכירה', 'מחיר', 'price'],
      min_qty: ['מינימום', 'מלאימינימום', 'min'],
      reorder_qty: ['כמות הזמנה', 'כמותהזמנה', 'reorder'],
      supplier: ['ספק', 'supplier'],
      qty: ['כמות במלאי', 'כמותבמלאי', 'יתרה', 'מלאי', 'qty', 'stock'],
      lot_no: ['אצווה', 'lot', 'batch'],
      expiry: ['תפוגה', 'תאריךתפוגה', 'expiry', 'exp'],
    },
    required: ['sku', 'name'],
  },
  customers: {
    label: 'לקוחות (חנויות)',
    fields: {
      code: ['קוד לקוח', 'קודלקוח', 'קוד', 'code'],
      name: ['שם לקוח', 'שםלקוח', 'שם', 'name'],
      chain: ['רשת', 'chain'],
      city: ['עיר', 'city'],
      region: ['אזור', 'region'],
      phone: ['טלפון', 'phone', 'נייד'],
      address: ['כתובת', 'address'],
    },
    required: ['name'],
  },
  suppliers: {
    label: 'ספקים',
    fields: {
      name: ['שם ספק', 'שםספק', 'שם', 'name'],
      phone: ['טלפון', 'phone'],
      email: ['אימייל', 'מייל', 'email'],
      lead_days: ['ימי אספקה', 'ימיאספקה', 'lead'],
    },
    required: ['name'],
  },
};

export function mapColumns(kind, headers) {
  const spec = IMPORT_KINDS[kind].fields;
  const used = new Set();
  const m = {};
  for (const [field, aliases] of Object.entries(spec)) {
    const al = aliases.map(norm);
    for (const pass of [0, 1]) {
      if (m[field]) break;
      const hit = headers.find((h) => !used.has(h) && al.some((a) => (pass ? norm(h).includes(a) : norm(h) === a)));
      if (hit) { m[field] = hit; used.add(hit); }
    }
  }
  return m;
}

export function toISODate(v) {
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

export async function downloadTemplate(kind) {
  const spec = IMPORT_KINDS[kind].fields;
  const head = Object.values(spec).map((a) => a[0]);
  const sample = {
    products: ['D2001', 'חלב 1% 1 ל׳', '7290000000017', 'מוצרי חלב', 'קרטון', 4.2, 6.1, 100, 200, 'מחלבות הגליל', 150, 'L-2311', '2026-12-05'],
    customers: ['C900', 'מכולת דוגמה', 'עצמאי', 'חיפה', 'צפון', '050-0000000', 'הרצל 1'],
    suppliers: ['ספק לדוגמה', '03-0000000', 'orders@example.com', 3],
  }[kind];
  await exportXlsx(`תבנית-${IMPORT_KINDS[kind].label}.xlsx`, [Object.fromEntries(head.map((h, i) => [h, sample[i]]))]);
}
