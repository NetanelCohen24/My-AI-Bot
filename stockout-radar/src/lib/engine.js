/**
 * Stockout Radar — detection engine (pure functions, no React).
 *
 * Input rows: { date, store, storeName?, chain, region?, sku, product, qty, inv }
 * Output: per store×SKU "cells" with a status + metrics, plus network KPIs.
 */
import { dayRange, addDays, dow } from './dates.js';

export const DEFAULT_SETTINGS = {
  invThreshold: 10,   // phantom: POS inventory must be above this
  zeroDays: 3,        // phantom: consecutive zero-sale days (3–5)
  maWindow: 28,       // moving-average / σ window
  zThreshold: 2,      // anomaly: |z| above this
  zCritical: 3,       // anomaly: |z| above this = critical
  minBaseline: 0.5,   // baseline avg units/day for a series to be "alive"
  minConfidence: 0.99, // phantom: P(streak isn't random) — protects slow movers
};

// Priority order: lower = more urgent. Drives the matrix and the alert queue.
export const STATUS = {
  phantom: { rank: 0, label: 'מלאי רפאים', short: 'רפאים', color: '#F59E0B' },
  critical: { rank: 1, label: 'נפילה קריטית', short: 'קריטי', color: '#FF3B5C' },
  oos: { rank: 2, label: 'אזל מהמלאי', short: 'חוסר', color: '#A78BFA' },
  drop: { rank: 3, label: 'ירידה חריגה', short: 'ירידה', color: '#FB7185' },
  spike: { rank: 4, label: 'קפיצת ביקוש', short: 'זינוק', color: '#38BDF8' },
  ok: { rank: 5, label: 'תקין', short: 'תקין', color: '#10B981' },
  idle: { rank: 6, label: 'ללא פעילות', short: '—', color: '#334155' },
};

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a, m = mean(a)) =>
  a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0;

/**
 * Low-volume series have tiny / zero σ, which would make every blip a "3σ" event.
 * Floor σ with a Poisson-style term (√μ) so z-scores stay meaningful for slow movers.
 */
const robustSigma = (s, m) => Math.max(s, Math.sqrt(Math.max(m, 0)) * 0.6, 0.5);

/** Build dense daily series (missing days → 0 sales, inventory carried forward). */
export function buildSeries(rows) {
  if (!rows.length) return { series: [], days: [], asOf: null };
  let min = rows[0].date;
  let max = rows[0].date;
  const map = new Map();
  for (const r of rows) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
    const key = `${r.store}|${r.sku}`;
    let s = map.get(key);
    if (!s) {
      s = {
        key, store: r.store, storeName: r.storeName || '', chain: r.chain || 'ללא רשת',
        region: r.region || 'לא משויך', sku: r.sku, product: r.product || r.sku, byDate: new Map(),
      };
      map.set(key, s);
    }
    if (r.storeName) s.storeName = r.storeName;
    if (r.region) s.region = r.region;
    if (r.product) s.product = r.product;
    s.byDate.set(r.date, r);
  }
  const days = dayRange(min, max);
  const series = [];
  for (const s of map.values()) {
    const qty = new Array(days.length);
    const inv = new Array(days.length);
    const present = new Array(days.length);
    let lastInv = null;
    days.forEach((d, i) => {
      const r = s.byDate.get(d);
      present[i] = !!r;
      qty[i] = r ? Math.max(0, r.qty || 0) : 0;
      if (r && r.inv != null && !Number.isNaN(r.inv)) lastInv = r.inv;
      inv[i] = lastInv;
    });
    delete s.byDate;
    series.push({ ...s, qty, inv, present });
  }
  return { series, days, asOf: max };
}

/**
 * Rolling stats over the `w` days strictly *before* day i.
 * Retail has a strong weekly rhythm (Thu/Fri peaks, quiet Saturday), so a raw σ is inflated
 * by seasonality and hides real breaks. We estimate a shrunk day-of-week index inside the
 * window and compute σ on the de-seasonalised residuals. `expect(j)` = MA28 × DOW index.
 */
function windowStats(qty, days, i, w) {
  const from = Math.max(0, i - w);
  const win = qty.slice(from, i);
  const m = mean(win);
  const sum = new Array(7).fill(0);
  const cnt = new Array(7).fill(0);
  for (let j = from; j < i; j++) { const d = dow(days[j]); sum[d] += qty[j]; cnt[d]++; }
  const K = 2; // shrinkage toward 1.0 — only ~4 samples per weekday
  const idx = sum.map((sm, d) => (m > 0 ? (sm + K * m) / ((cnt[d] + K) * m) : 1));
  const expect = (j) => m * idx[dow(days[j])];
  const resid = [];
  for (let j = from; j < i; j++) resid.push(qty[j] - expect(j));
  return { mean: m, std: std(resid, 0), n: win.length, expect };
}

export function analyzeSeries(s, days, cfg) {
  const n = days.length;
  const last = n - 1;
  const w = cfg.maWindow;
  const invNow = s.inv[last] ?? 0;

  // Consecutive zero-sale streak ending at asOf.
  let zeroStreak = 0;
  for (let i = last; i >= 0 && s.qty[i] === 0; i--) zeroStreak++;

  // Baseline = the 28 days *before* the streak (so the outage doesn't poison its own baseline).
  const baseEnd = n - Math.max(zeroStreak, 1);
  const baseWin = s.qty.slice(Math.max(0, baseEnd - w), baseEnd);
  const baseAvg = mean(baseWin);

  // Z-score for the latest day vs. the trailing 28-day window.
  const st = windowStats(s.qty, days, last, w);
  const expLast = st.expect(last);
  const sigma = robustSigma(st.std, expLast);
  const z = st.n >= 7 ? (s.qty[last] - expLast) / sigma : 0;

  // Short-horizon z for the last 3 days combined (catches slower slides).
  const k = Math.min(3, n);
  const st3 = windowStats(s.qty, days, n - k, w);
  let act3 = 0;
  let exp3 = 0;
  for (let j = n - k; j < n; j++) { act3 += s.qty[j]; exp3 += st3.expect(j); }
  const z3 = st3.n >= 7 ? (act3 - exp3) / (robustSigma(st3.std, exp3 / k) * Math.sqrt(k)) : 0;

  // Poisson guard: probability that a streak this long is NOT just bad luck for a slow mover.
  const confidence = 1 - Math.exp(-baseAvg * zeroStreak);

  const daysCover = st.mean > 0 ? invNow / st.mean : Infinity;
  const alive = baseAvg >= cfg.minBaseline;

  // Materiality: units below (+) / above (−) the seasonal expectation. Stops 1-unit noise alerts.
  const gap = expLast - s.qty[last];

  let status = 'ok';
  const reasons = [];
  if (!alive && st.mean < cfg.minBaseline) {
    status = 'idle';
  } else if (zeroStreak >= cfg.zeroDays && invNow > cfg.invThreshold && baseAvg > 0 && confidence >= cfg.minConfidence) {
    status = 'phantom';
    reasons.push(`${zeroStreak} ימים ללא מכירה למרות ${fmtN(invNow)} יח׳ במערכת`);
    reasons.push(`ממוצע 28 יום קודם: ${baseAvg.toFixed(1)} יח׳/יום · ודאות ${(confidence * 100).toFixed(1)}%`);
  } else if (invNow <= 0 && zeroStreak >= 1 && baseAvg > 0) {
    status = 'oos';
    reasons.push(`מלאי 0 במערכת · ${zeroStreak} ימים ללא מכירה`);
  } else if (gap >= 3 && (z <= -cfg.zCritical || z3 <= -(cfg.zCritical + 0.5))) {
    status = 'critical';
    reasons.push(`Z=${z.toFixed(2)} ביום האחרון (Z3=${z3.toFixed(2)})`);
  } else if (gap >= 2 && ((z <= -cfg.zThreshold && z3 <= -1) || z3 <= -(cfg.zThreshold + 0.5))) {
    status = 'drop';
    reasons.push(`Z=${z.toFixed(2)} · Z3=${z3.toFixed(2)}`);
  } else if (z >= cfg.zThreshold && -gap >= Math.max(3, expLast * 0.5)) {
    status = 'spike';
    reasons.push(`Z=+${z.toFixed(2)} · כיסוי ${fmtCover(daysCover)} ימים`);
  }

  const lostPerDay = status === 'phantom' || status === 'oos' ? baseAvg : Math.max(0, expLast - s.qty[last]);
  const lostUnits = status === 'phantom' || status === 'oos' ? baseAvg * zeroStreak : 0;

  return {
    key: s.key, store: s.store, storeName: s.storeName, chain: s.chain, region: s.region,
    sku: s.sku, product: s.product, status, reasons,
    lastQty: s.qty[last], expected: expLast, invNow, zeroStreak, baseAvg, ma: st.mean, sigma, z, z3,
    daysCover, lostPerDay, lostUnits, confidence,
    severity: severityScore(status, { z, zeroStreak, baseAvg, invNow }),
  };
}

function severityScore(status, { z, zeroStreak, baseAvg, invNow }) {
  switch (status) {
    case 'phantom': return 100 + zeroStreak * baseAvg * 2 + Math.min(invNow, 100) * 0.1;
    case 'critical': return 80 + Math.abs(z) * 4;
    case 'oos': return 70 + zeroStreak * baseAvg;
    case 'drop': return 50 + Math.abs(z) * 4;
    case 'spike': return 30 + z * 3;
    default: return 0;
  }
}

/** Full 30-day chart payload for the drawer. */
export function cellTrend(s, days, cfg, span = 30) {
  const out = [];
  const start = Math.max(0, days.length - span);
  for (let i = start; i < days.length; i++) {
    const st = windowStats(s.qty, days, i, cfg.maWindow);
    const ex = st.expect(i);
    const sg = robustSigma(st.std, ex);
    out.push({
      date: days[i],
      qty: s.qty[i],
      inv: s.inv[i],
      ma: +st.mean.toFixed(2),
      expected: +ex.toFixed(2),
      band: [Math.max(0, +(ex - cfg.zThreshold * sg).toFixed(2)), +(ex + cfg.zThreshold * sg).toFixed(2)],
      z: st.n >= 7 ? +((s.qty[i] - ex) / sg).toFixed(2) : 0,
      present: s.present[i],
    });
  }
  return out;
}

export function analyze(rows, cfg = DEFAULT_SETTINGS) {
  const { series, days, asOf } = buildSeries(rows);
  const cells = series.map((s) => analyzeSeries(s, days, cfg));
  const byKey = new Map(series.map((s) => [s.key, s]));

  const count = (st) => cells.filter((c) => c.status === st).length;
  const active = cells.filter((c) => c.status !== 'idle');
  const phantoms = cells.filter((c) => c.status === 'phantom');

  // Network sales sparkline (last 30 days).
  const span = Math.min(30, days.length);
  const network = days.slice(-span).map((d, j) => {
    const i = days.length - span + j;
    let tot = 0;
    for (const s of series) tot += s.qty[i];
    return { date: d, qty: tot };
  });
  const lastTot = network.at(-1)?.qty ?? 0;
  const prevAvg = mean(network.slice(-8, -1).map((x) => x.qty));

  const kpis = {
    asOf,
    days: days.length,
    stores: new Set(cells.map((c) => c.store)).size,
    skus: new Set(cells.map((c) => c.sku)).size,
    cells: cells.length,
    phantom: phantoms.length,
    critical: count('critical'),
    drop: count('drop'),
    spike: count('spike'),
    oos: count('oos'),
    stuckUnits: phantoms.reduce((s, c) => s + c.invNow, 0),
    lostUnits: cells.reduce((s, c) => s + c.lostUnits, 0),
    lostPerDay: cells.filter((c) => c.status === 'phantom' || c.status === 'oos').reduce((s, c) => s + c.lostPerDay, 0),
    health: active.length ? active.filter((c) => c.status === 'ok').length / active.length : 1,
    lastTot,
    deltaVs7: prevAvg ? (lastTot - prevAvg) / prevAvg : 0,
    network,
  };

  return { cells, days, asOf, kpis, seriesByKey: byKey };
}

export const isAlert = (st) => st !== 'ok' && st !== 'idle';

export const fmtN = (x, d = 0) =>
  x == null || Number.isNaN(x) ? '—' : Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtCover = (x) => (x === Infinity ? '∞' : x > 99 ? '99+' : x.toFixed(1));
export const fmtZ = (z) => `${z > 0 ? '+' : z < 0 ? '−' : ''}${Math.abs(z).toFixed(1)}σ`;

/** Lookup of sibling stores for a given store code (used by task grouping). */
export function storeIndex(cells) {
  const m = new Map();
  for (const c of cells) if (!m.has(c.store)) m.set(c.store, { store: c.store, storeName: c.storeName, chain: c.chain, region: c.region });
  return m;
}

// Exposed for the tests / debug.
export const _internals = { mean, std, robustSigma, addDays };
