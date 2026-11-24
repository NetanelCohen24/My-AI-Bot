/**
 * Realistic mock data for Israeli retail chains, with built-in edge scenarios:
 *  - Phantom inventory (high POS stock, sales frozen at 0 for 3–7 days)
 *  - Sharp drops (planogram change / competitor promo)
 *  - Demand spikes (heatwave / holiday promo) that drain stock
 *  - True out-of-stock (inventory hits 0)
 *  - Store-wide POS outage (every SKU in one store collapses)
 *  - Slow movers with naturally sparse sales (must NOT trigger false alarms)
 */
import { addDays, dow, toDay } from './dates.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda, r) {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(r)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

export const STORES = [
  { store: '1021', storeName: 'חיפה – גרנד קניון', chain: 'שופרסל', region: 'צפון', size: 1.4 },
  { store: '1034', storeName: 'קריית ביאליק', chain: 'שופרסל', region: 'צפון', size: 1.0 },
  { store: '2207', storeName: 'כרמיאל', chain: 'רמי לוי', region: 'צפון', size: 1.2 },
  { store: '3105', storeName: 'נצרת עילית', chain: 'ויקטורי', region: 'צפון', size: 0.8 },
  { store: '1102', storeName: 'תל אביב – אבן גבירול', chain: 'שופרסל', region: 'מרכז', size: 1.1 },
  { store: '1145', storeName: 'רמת גן – בורסה', chain: 'שופרסל', region: 'מרכז', size: 0.9 },
  { store: '4410', storeName: 'ראשון לציון – מערב', chain: 'יוחננוף', region: 'מרכז', size: 1.5 },
  { store: '3150', storeName: 'חולון – קוגל', chain: 'ויקטורי', region: 'מרכז', size: 1.0 },
  { store: '5012', storeName: 'פתח תקווה – סגולה', chain: 'אושר עד', region: 'מרכז', size: 1.6 },
  { store: '6003', storeName: 'תל אביב – דיזנגוף', chain: 'טיב טעם', region: 'מרכז', size: 0.7 },
  { store: '1210', storeName: 'כפר סבא – ויצמן', chain: 'שופרסל', region: 'שרון', size: 1.0 },
  { store: '2240', storeName: 'נתניה – פולג', chain: 'רמי לוי', region: 'שרון', size: 1.3 },
  { store: '4422', storeName: 'רעננה – אחוזה', chain: 'יוחננוף', region: 'שרון', size: 1.1 },
  { store: '2201', storeName: 'ירושלים – תלפיות', chain: 'רמי לוי', region: 'ירושלים', size: 1.7 },
  { store: '2215', storeName: 'מודיעין', chain: 'רמי לוי', region: 'ירושלים', size: 1.2 },
  { store: '5030', storeName: 'בית שמש', chain: 'אושר עד', region: 'ירושלים', size: 1.4 },
  { store: '1301', storeName: 'באר שבע – BIG', chain: 'שופרסל', region: 'דרום', size: 1.2 },
  { store: '3180', storeName: 'אשדוד – סיטי', chain: 'ויקטורי', region: 'דרום', size: 1.1 },
  { store: '4460', storeName: 'אשקלון – מרינה', chain: 'יוחננוף', region: 'דרום', size: 0.9 },
  { store: '5044', storeName: 'קריית גת', chain: 'אושר עד', region: 'דרום', size: 1.0 },
];

export const PRODUCTS = [
  { sku: '7290000066318', product: 'חלב 3% קרטון 1 ל׳', base: 18, short: 'חלב 3%' },
  { sku: '7290000042435', product: 'קוטג׳ 5% 250 גר׳', base: 14, short: 'קוטג׳ 5%' },
  { sku: '7290110115302', product: 'במבה 80 גר׳', base: 12, short: 'במבה 80' },
  { sku: '7290000176277', product: 'שוקולד חלב 100 גר׳', base: 8, short: 'שוקולד חלב' },
  { sku: '7290014758674', product: 'קפה נמס 200 גר׳', base: 4, short: 'קפה נמס' },
  { sku: '7290000547104', product: 'פתיתים אפויים 500 גר׳', base: 5, short: 'פתיתים' },
  { sku: '7290004127329', product: 'חומוס מוכן 400 גר׳', base: 9, short: 'חומוס' },
  { sku: '7290011194239', product: 'מים מינרליים 6×1.5 ל׳', base: 7, short: 'מים 6-פק' },
  { sku: '7290016334166', product: 'שמפו 750 מ״ל', base: 1.6, short: 'שמפו 750' },
  { sku: '7290008757041', product: 'נייר טואלט 32 גלילים', base: 2.4, short: 'נייר טואלט' },
  { sku: '7290018567074', product: 'משקה אנרגיה 250 מ״ל', base: 3.5, short: 'אנרגיה 250' },
  { sku: '7290102395217', product: 'טחינה גולמית 500 גר׳', base: 3, short: 'טחינה' },
];

// Day-of-week multipliers (Sun..Sat): Thursday/Friday peaks, Saturday mostly closed.
const DOW = [0.95, 0.85, 0.9, 1.0, 1.35, 1.25, 0.3];

/** Scenario script: (storeCode, sku) → effect applied to the last N days. */
const SCENARIOS = [
  // Phantom inventory: shelf empty / stock stuck in back room / mis-slotted.
  { store: '1021', sku: '7290000042435', kind: 'phantom', days: 5, inv: 46 },
  { store: '4410', sku: '7290110115302', kind: 'phantom', days: 4, inv: 72 },
  { store: '2201', sku: '7290000176277', kind: 'phantom', days: 6, inv: 38 },
  { store: '5012', sku: '7290004127329', kind: 'phantom', days: 3, inv: 29 },
  { store: '3180', sku: '7290011194239', kind: 'phantom', days: 7, inv: 54 },
  { store: '1210', sku: '7290000066318', kind: 'phantom', days: 4, inv: 64 },
  { store: '2240', sku: '7290014758674', kind: 'phantom', days: 5, inv: 22 },
  // Sharp drop (not zero): planogram moved to bottom shelf, competitor promo.
  { store: '1102', sku: '7290000066318', kind: 'drop', days: 2, factor: 0.12 },
  { store: '4422', sku: '7290004127329', kind: 'drop', days: 1, factor: 0.1 },
  { store: '2215', sku: '7290000042435', kind: 'drop', days: 3, factor: 0.3 },
  { store: '1301', sku: '7290110115302', kind: 'drop', days: 1, factor: 0.2 },
  // Demand spikes: heatwave water, holiday promo.
  { store: '1301', sku: '7290011194239', kind: 'spike', days: 2, factor: 3.4 },
  { store: '4460', sku: '7290011194239', kind: 'spike', days: 1, factor: 3.8 },
  { store: '5030', sku: '7290018567074', kind: 'spike', days: 1, factor: 4.2 },
  { store: '6003', sku: '7290000176277', kind: 'spike', days: 2, factor: 3.0 },
  { store: '2207', sku: '7290000547104', kind: 'spike', days: 1, factor: 3.5 },
  // True OOS: inventory physically and systemically 0.
  { store: '3105', sku: '7290000066318', kind: 'oos', days: 2 },
  { store: '1145', sku: '7290008757041', kind: 'oos', days: 3 },
  { store: '5044', sku: '7290102395217', kind: 'oos', days: 2 },
];
// Store-wide POS outage on the last day: everything collapses to ~15%.
const OUTAGE = { store: '3150', days: 1, factor: 0.15 };

/** Generate `span` days ending at `endDay` (defaults to yesterday). */
export function generateMock({ span = 63, endDay, seed = 4242 } = {}) {
  const r = rng(seed);
  let end = endDay || addDays(toDay(new Date()), -1);
  if (dow(end) === 6) end = addDays(end, -1); // never end on Saturday
  const start = addDays(end, -(span - 1));
  const rows = [];

  for (const st of STORES) {
    const storeAff = 0.85 + r() * 0.3;
    for (const p of PRODUCTS) {
      const sc = SCENARIOS.find((s) => s.store === st.store && s.sku === p.sku);
      const outage = OUTAGE.store === st.store ? OUTAGE : null;
      const lam0 = p.base * st.size * storeAff * (0.75 + r() * 0.5);
      // Slow movers in small stores: deliberately sparse to test false-positive guards.
      const cap = Math.max(Math.round(lam0 * 12), 24);
      let inv = Math.round(cap * (0.55 + r() * 0.3));
      const leadEvery = 3 + Math.floor(r() * 3);

      for (let i = 0; i < span; i++) {
        const day = addDays(start, i);
        const fromEnd = span - 1 - i; // 0 = last day
        const trend = 1 + (i / span) * (r() * 0.12 - 0.04);
        let lam = lam0 * DOW[dow(day)] * trend;

        // Replenishment (not on Saturday), skipped during phantom/oos windows.
        const inScenario = sc && fromEnd < sc.days;
        if (dow(day) !== 6 && i % leadEvery === 0 && !(inScenario && (sc.kind === 'phantom' || sc.kind === 'oos'))) {
          if (inv < cap * 0.75) inv = cap;
        }

        let qty;
        if (inScenario && sc.kind === 'phantom') {
          qty = 0;
          if (fromEnd === sc.days - 1) inv = sc.inv; // system believes stock exists
        } else if (inScenario && sc.kind === 'oos') {
          qty = 0;
          inv = 0;
        } else {
          if (inScenario && sc.kind === 'drop') lam *= sc.factor;
          if (inScenario && sc.kind === 'spike') lam *= sc.factor;
          if (outage && fromEnd < outage.days) lam *= outage.factor;
          // OOS lead-in: drain stock just before the scenario window.
          if (sc && sc.kind === 'oos' && fromEnd < sc.days + 3) lam *= 1.6;
          qty = Math.min(poisson(lam, r), Math.max(inv, 0));
          if (inScenario && sc.kind === 'spike') qty = Math.max(qty, Math.round(lam * 0.9));
          inv -= qty;
          // Small shrink noise on POS inventory.
          if (r() < 0.04) inv -= 1;
          inv = Math.max(inv, 0);
        }

        rows.push({
          date: day, store: st.store, storeName: st.storeName, chain: st.chain, region: st.region,
          sku: p.sku, product: p.product, qty, inv,
        });
      }
    }
  }
  return rows;
}

export const SCENARIO_COUNT = SCENARIOS.length + 1;

/** CSV export (Hebrew headers) so users can round-trip the demo through the uploader. */
export function rowsToCsv(rows) {
  const head = ['תאריך', 'קוד סניף', 'שם סניף', 'שם רשת', 'אזור', 'ברקוד', 'שם מוצר', 'כמות מכירה יומית', 'יתרת מלאי במערכת'];
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) => [r.date, r.store, r.storeName, r.chain, r.region, r.sku, r.product, r.qty, r.inv].map(esc).join(','));
  return '﻿' + [head.join(','), ...lines].join('\n');
}
