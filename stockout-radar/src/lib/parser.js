/**
 * CSV / Excel ingestion with fuzzy Hebrew + English header mapping.
 */
import { normalizeDate } from './dates.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/["'׳״`\s_\-./\\()]/g, '');

// Order matters inside each list: the first match wins. More specific first.
export const FIELD_ALIASES = {
  date: ['תאריך', 'date', 'day', 'יום', 'salesdate'],
  store: ['קודסניף', 'מססניף', 'מספרסניף', 'storeid', 'storecode', 'branchcode', 'branchid', 'store', 'branch', 'סניף'],
  storeName: ['שםסניף', 'storename', 'branchname'],
  chain: ['שםרשת', 'רשת', 'chain', 'retailer', 'banner', 'לקוח'],
  region: ['אזור', 'region', 'area', 'מחוז', 'zone'],
  sku: ['ברקודמקט', 'ברקוד', 'מקט', 'barcode', 'sku', 'ean', 'itemcode', 'itemid', 'קודפריט'],
  product: ['שםמוצר', 'תיאורמוצר', 'productname', 'itemname', 'description', 'product', 'מוצר', 'פריט'],
  qty: ['כמותמכירהיומית', 'כמותמכירה', 'מכירותיחידות', 'מכירות', 'כמות', 'unitssold', 'salesqty', 'qty', 'units', 'sales', 'quantity'],
  inv: ['יתרתמלאיבמערכת', 'יתרתמלאי', 'מלאיposinventory', 'posinventory', 'מלאי', 'inventory', 'onhand', 'stock', 'soh'],
};

export const REQUIRED = ['date', 'store', 'sku', 'qty', 'inv'];
export const FIELD_LABELS = {
  date: 'תאריך', store: 'קוד סניף', storeName: 'שם סניף', chain: 'שם רשת', region: 'אזור',
  sku: 'ברקוד/מק״ט', product: 'שם מוצר', qty: 'כמות מכירה', inv: 'יתרת מלאי',
};

export function mapHeaders(headers) {
  const normed = headers.map((h) => ({ raw: h, n: norm(h) }));
  const used = new Set();
  const mapping = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    // Pass 1: exact; pass 2: header contains alias.
    for (const pass of [0, 1]) {
      if (mapping[field]) break;
      for (const a of aliases) {
        const hit = normed.find((h) => !used.has(h.raw) && (pass === 0 ? h.n === a : h.n.includes(a)));
        if (hit) { mapping[field] = hit.raw; used.add(hit.raw); break; }
      }
    }
  }
  return mapping;
}

const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[,\s₪]/g, ''));
  return Number.isNaN(n) ? 0 : n;
};

const cleanCode = (v) => {
  let s = String(v ?? '').trim();
  // Excel turns barcodes into 7.29E+12 — recover the integer.
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) s = BigInt(Math.round(Number(s))).toString();
  return s.replace(/\.0+$/, '');
};

export function normalizeRows(raw, fileName = '') {
  if (!raw.length) return { rows: [], issues: [`${fileName}: הקובץ ריק`], mapping: {} };
  const headers = Object.keys(raw[0]);
  const mapping = mapHeaders(headers);
  const missing = REQUIRED.filter((f) => !mapping[f]);
  if (missing.length) {
    return {
      rows: [], mapping,
      issues: [`${fileName}: חסרות עמודות חובה – ${missing.map((m) => FIELD_LABELS[m]).join(', ')}`],
    };
  }
  const rows = [];
  let bad = 0;
  for (const r of raw) {
    const date = normalizeDate(r[mapping.date]);
    const store = cleanCode(r[mapping.store]);
    const sku = cleanCode(r[mapping.sku]);
    if (!date || !store || !sku) { bad++; continue; }
    rows.push({
      date, store, sku,
      storeName: mapping.storeName ? String(r[mapping.storeName] ?? '').trim() : '',
      chain: mapping.chain ? String(r[mapping.chain] ?? '').trim() : '',
      region: mapping.region ? String(r[mapping.region] ?? '').trim() : '',
      product: mapping.product ? String(r[mapping.product] ?? '').trim() : '',
      qty: toNum(r[mapping.qty]),
      inv: toNum(r[mapping.inv]),
    });
  }
  const issues = bad ? [`${fileName}: ${bad} שורות דולגו (תאריך/סניף/ברקוד חסר)`] : [];
  return { rows, issues, mapping };
}

export async function parseFile(file) {
  const name = file.name;
  const ext = name.split('.').pop().toLowerCase();
  let raw;
  if (ext === 'csv' || ext === 'txt' || file.type === 'text/csv') {
    const { default: Papa } = await import('papaparse');
    const text = await file.text();
    raw = Papa.parse(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true, dynamicTyping: false }).data;
  } else if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  } else {
    return { rows: [], issues: [`${name}: פורמט לא נתמך (CSV / XLSX בלבד)`], mapping: {} };
  }
  return normalizeRows(raw, name);
}

/** Merge many files; later files override duplicates (same date+store+sku). */
export function mergeRows(...sets) {
  const m = new Map();
  for (const set of sets) for (const r of set) m.set(`${r.date}|${r.store}|${r.sku}`, r);
  return [...m.values()];
}
