// Date helpers working on ISO day strings (YYYY-MM-DD) in UTC to avoid TZ drift.
const DAY = 86400000;

export const toDay = (d) => d.toISOString().slice(0, 10);
export const parseDay = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (s, n) => toDay(new Date(parseDay(s).getTime() + n * DAY));
export const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / DAY);

export function dayRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const HE_DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const dow = (s) => parseDay(s).getUTCDay();
export const heDow = (s) => HE_DOW[dow(s)];
export const shortDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const longDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/**
 * Normalise anything a CSV/Excel cell can hold into YYYY-MM-DD, or null.
 * Supports: Date objects, Excel serials, ISO, DD/MM/YYYY, DD.MM.YY, DD-MM-YYYY.
 * Day-first is assumed for ambiguous slash formats (Israeli convention).
 */
export function normalizeDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    // xlsx gives local-midnight Dates; shift by TZ offset to recover the calendar day.
    return toDay(new Date(v.getTime() - v.getTimezoneOffset() * 60000));
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return toDay(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return fmt(y, +m[2], +m[1]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return normalizeDate(Number(s));
  const d = new Date(s);
  return isNaN(d) ? null : toDay(d);
}

function fmt(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
