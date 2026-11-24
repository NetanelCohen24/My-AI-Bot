/**
 * Order & expiry planning engine (pure, unit = cases).
 *
 * Per product we simulate day by day from the stock date:
 *   • demand = forecast per month (+ promo cases entered in the app)
 *   • batches are consumed FEFO (earliest expiry first)
 *   • a batch is blocked for sale `blockDays` before its expiry; whatever is left then is "at risk"
 *   • open orders (entered in the app) arrive as new batches
 * From that we get: stockout date, order-by date (vs. lead time), unavoidable shortage,
 * cases at expiry risk, and a suggested order that is capped by shelf life.
 */

export const DEFAULTS = {
  asOf: null,              // stock date; null = today
  method: 'recent',        // 'recent' (weighted last 3 months) | 'year' (last 12) | 'file' (avg column)
  blockDays: 30,           // used when the row has none
  leadDays: 60,            // used when the row has none
  safetyDays: 14,          // safety stock in days of demand (on top of the per-product minimum)
  coverLocalMonths: 1.5,   // how much one order should cover – local suppliers
  coverImportMonths: 3,    // – import suppliers
  soonDays: 21,
  riskDays: 120,           // "expiry risk" window shown on the dashboard
  palletsPer20: 11,
  palletsPer40: 23,
  horizonDays: 900,
};

export const STATUS = {
  out: { label: 'אזל', hint: 'אין מלאי שמיש עכשיו', color: '#FF3B5C', rank: -1 },
  short: { label: 'יחסר', hint: 'ייגמר לפני שהזמנה חדשה תספיק להגיע', color: '#FF3B5C', rank: 0 },
  order: { label: 'להזמין עכשיו', hint: 'עבר מועד ההזמנה לפי זמן האספקה', color: '#F59E0B', rank: 1 },
  soon: { label: 'להזמין בקרוב', hint: 'מועד ההזמנה בשבועות הקרובים', color: '#FBBF24', rank: 2 },
  ok: { label: 'מכוסה', hint: 'יש מספיק מלאי', color: '#10B981', rank: 3 },
  idle: { label: 'ללא מכירות', hint: 'אין מכר בחודשים האחרונים', color: '#64748B', rank: 4 },
};

const DAY = 86400000;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);
const monthOf = (iso) => iso.slice(0, 7);
const daysInMonth = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
export const addMonths = (ym, n) => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** Monthly demand forecast in cases + trend (last 3 vs previous 3 full months). */
export function forecast(p, asOf, method, salesEnd) {
  // Only use complete months that actually have data.
  let cur = monthOf(asOf);
  if (salesEnd && addMonths(salesEnd, 1) < cur) cur = addMonths(salesEnd, 1);
  const months = [];
  for (let i = 1; i <= 12; i++) months.push(addMonths(cur, -i)); // newest first, full months only
  const val = (m) => Math.max(0, p.history?.[m] ?? 0);
  const hasHist = months.some((m) => p.history?.[m] != null && p.history[m] !== 0);
  const l3 = months.slice(0, 3).map(val);
  const p3 = months.slice(3, 6).map(val);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const trend = avg(p3) > 0 ? avg(l3) / avg(p3) - 1 : null;
  let monthly;
  let used = method;
  if (method === 'file' || !hasHist) {
    monthly = Math.max(0, p.avgMonthly || 0);
    used = 'file';
    if (!monthly && hasHist) { monthly = avg(months.map(val)); used = 'year'; }
  } else if (method === 'year') {
    monthly = avg(months.map(val));
  } else {
    monthly = (l3[0] * 3 + l3[1] * 2 + l3[2]) / 6;
  }
  return { monthly, trend, used, last3: avg(l3), prev3: avg(p3) };
}

export function analyzeProduct(p, cfg, extra = {}) {
  const asOf = cfg.asOf || todayISO();
  const promos = { ...(p.promos || {}), ...(extra.promos || {}) };
  const incoming = extra.incoming || [];
  const f = forecast(p, asOf, cfg.method, cfg.salesEnd);
  const lead = Number(p.leadDays) > 0 ? Number(p.leadDays) : cfg.leadDays;
  const blockDays = Number(p.blockDays) >= 0 && p.blockDays !== undefined && p.blockDays !== null && p.blockDays !== '' ? Number(p.blockDays) : cfg.blockDays;
  const shelf = Number(p.shelfLifeDays) > 0 ? Number(p.shelfLifeDays) : null;
  const isImport = /יבוא|import/i.test(p.origin || '');
  const minCases = Math.max(0, Number(p.minCases) || 0);

  const dailyAt = (iso) => {
    const ym = monthOf(iso);
    return f.monthly / 30.4 + (Number(promos[ym]) || 0) / daysInMonth(ym);
  };
  const baseDaily = f.monthly / 30.4;
  const safety = Math.max(minCases, baseDaily * cfg.safetyDays);

  // Batches: block date = expiry − blockDays. Already blocked at asOf → "expired" bucket.
  const batches = [
    ...p.batches.map((b, i) => ({ id: `b${i}`, expiry: b.expiry, qty: b.qty, arrive: 0, src: 'stock' })),
    ...incoming.map((o, i) => ({ id: `o${i}`, expiry: o.expiry || (shelf ? addDays(o.eta, shelf) : null), qty: Number(o.qty), arrive: Math.max(0, diffDays(o.eta, asOf)), src: 'order' })),
  ].map((b) => ({ ...b, block: b.expiry ? diffDays(b.expiry, asOf) - blockDays : Infinity, left: b.qty, sold: 0, wasted: 0, endDay: null }))
    .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));

  const expiredNow = batches.filter((b) => b.src === 'stock' && b.block <= 0);
  for (const b of expiredNow) { b.wasted = b.left; b.left = 0; b.endDay = 0; }

  const H = cfg.horizonDays;
  const sellable = new Array(H + 1).fill(0);
  let stockoutDay = null;
  let belowSafetyDay = null;
  let shortDaysBeforeLead = 0;
  let lostBeforeLead = 0;
  const live = (t) => batches.filter((b) => b.left > 0 && b.arrive <= t && b.block > t);

  for (let t = 0; t <= H; t++) {
    // Block batches whose sell-by passed.
    for (const b of batches) if (b.left > 0 && b.block <= t && b.arrive <= t) { b.wasted += b.left; b.left = 0; b.endDay = t; }
    let need = t === 0 ? 0 : dailyAt(addDays(asOf, t));
    for (const b of live(t)) {
      if (need <= 0) break;
      const take = Math.min(need, b.left);
      b.left -= take; b.sold += take; need -= take;
      if (b.left <= 1e-9) { b.left = 0; b.endDay = t; }
    }
    const s = live(t).reduce((a, b) => a + b.left, 0);
    sellable[t] = s;
    if (need > 1e-6 && t < lead) { shortDaysBeforeLead++; lostBeforeLead += need; }
    if (stockoutDay == null && baseDaily > 0 && s <= 1e-6) stockoutDay = t;
    if (belowSafetyDay == null && baseDaily > 0 && s < safety) belowSafetyDay = t;
    if (stockoutDay != null && belowSafetyDay != null && t > lead && !batches.some((b) => b.left > 0)) break;
  }

  const atRisk = batches.filter((b) => b.wasted > 0.5 && b.endDay > 0);
  const orderByDay = belowSafetyDay == null ? null : belowSafetyDay - lead;
  let status;
  if (baseDaily <= 0) status = 'idle';
  else if (sellable[0] <= 1e-6) status = 'out';
  else if (shortDaysBeforeLead > 0) status = 'short';
  else if (orderByDay != null && orderByDay <= 0) status = 'order';
  else if (orderByDay != null && orderByDay <= cfg.soonDays) status = 'soon';
  else status = 'ok';

  // Suggested order if placed on max(today, order-by): cover N months after arrival,
  // but never more than can be sold before the new batch's own block date.
  const orderDay = Math.max(0, orderByDay ?? 0);
  const arriveDay = orderDay + lead;
  const onHandAtArrival = sellable[Math.min(arriveDay, H)] || 0;
  const coverMonths = isImport ? cfg.coverImportMonths : cfg.coverLocalMonths;
  let suggest = baseDaily > 0 ? Math.max(0, f.monthly * coverMonths + safety - onHandAtArrival) : 0;
  let shelfCap = null;
  if (shelf && baseDaily > 0) {
    // Assume goods arrive with ~85% of shelf life left; they must sell before blocking.
    const sellWindow = Math.max(0, shelf * 0.85 - blockDays);
    shelfCap = Math.floor(baseDaily * sellWindow);
    if (suggest > shelfCap) suggest = shelfCap;
  }
  const cpp = Number(p.casesPerPallet) || 0;
  const pallets = cpp ? suggest / cpp : null;
  if (isImport && cpp && suggest > 0) suggest = Math.ceil(suggest / cpp) * cpp; // full pallets for imports
  suggest = Math.ceil(suggest);

  const sellableNow = sellable[0];
  const unitValue = (Number(p.price) || 0) * (Number(p.unitsPerCase) || 1);
  const nextBlock = batches.filter((b) => b.left + b.sold > 0 && b.block > 0 && b.block < Infinity).sort((a, b) => a.block - b.block)[0];
  return {
    ...p, f, lead, blockDays, shelf, isImport, minCases, safety, baseDaily,
    batches, sellable, sellableNow,
    expiredNowQty: expiredNow.reduce((s, b) => s + b.wasted, 0),
    riskQty: atRisk.reduce((s, b) => s + b.wasted, 0),
    riskBatches: atRisk,
    firstRiskDay: atRisk.length ? Math.min(...atRisk.map((b) => b.endDay)) : null,
    nextBlockDay: nextBlock ? nextBlock.block : null,
    coverMonths: baseDaily > 0 ? sellableNow / f.monthly : Infinity,
    stockoutDay, stockoutDate: stockoutDay == null ? null : addDays(asOf, stockoutDay),
    orderByDay, orderByDate: orderByDay == null ? null : addDays(asOf, orderByDay),
    arriveDate: addDays(asOf, arriveDay),
    shortDaysBeforeLead, lostBeforeLead,
    suggest, shelfCap, pallets: cpp ? suggest / cpp : pallets,
    belowMin: minCases > 0 && sellableNow < minCases,
    status, unitValue, asOf,
  };
}

export function analyzeAll(data, cfg, overrides = {}) {
  const c = { ...DEFAULTS, ...cfg, salesEnd: data.meta?.salesEnd };
  const asOf = c.asOf || data.meta?.defaultAsOf || todayISO();
  const items = data.products.map((p) => analyzeProduct(p, { ...c, asOf }, overrides[p.sku]));
  const by = (s) => items.filter((i) => i.status === s);
  const risky = items.filter((i) => i.firstRiskDay != null && i.firstRiskDay <= c.riskDays);

  // Supplier groups for everything that needs ordering within the "soon" window.
  const groups = new Map();
  for (const i of items.filter((x) => ['out', 'short', 'order', 'soon'].includes(x.status) && x.suggest > 0)) {
    const k = i.supplier || 'ספק לא מוגדר';
    if (!groups.has(k)) groups.set(k, { supplier: k, items: [], isImport: false });
    const g = groups.get(k);
    g.items.push(i);
    g.isImport = g.isImport || i.isImport;
  }
  const orders = [...groups.values()].map((g) => {
    const pallets = g.items.reduce((s, i) => s + (i.pallets || 0), 0);
    const cases = g.items.reduce((s, i) => s + i.suggest, 0);
    const orderBy = Math.min(...g.items.map((i) => Math.max(0, i.orderByDay ?? 0)));
    let containers = null;
    if (g.isImport && pallets > 0) {
      const n40 = Math.floor(pallets / c.palletsPer40);
      const rest = pallets - n40 * c.palletsPer40;
      containers = { n40: n40 + (rest > c.palletsPer20 ? 1 : 0), n20: rest > 0 && rest <= c.palletsPer20 ? 1 : 0 };
      const cap = containers.n40 * c.palletsPer40 + containers.n20 * c.palletsPer20;
      containers.fill = cap ? pallets / cap : 0;
    }
    return {
      ...g, cases, pallets, orderByDay: orderBy, orderByDate: addDays(asOf, orderBy), containers,
      urgent: g.items.some((i) => i.status === 'short' || i.status === 'out'),
      missingPallet: g.items.some((i) => !i.casesPerPallet),
      value: g.items.reduce((s, i) => s + i.suggest * i.unitValue, 0),
    };
  }).sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.orderByDay - b.orderByDay);

  return {
    asOf, items, orders,
    kpis: {
      products: items.length,
      out: by('out').length, short: by('short').length, order: by('order').length, soon: by('soon').length, ok: by('ok').length, idle: by('idle').length,
      expiredQty: items.reduce((s, i) => s + i.expiredNowQty, 0),
      expiredSkus: items.filter((i) => i.expiredNowQty > 0).length,
      riskQty: risky.reduce((s, i) => s + i.riskBatches.filter((b) => b.endDay <= c.riskDays).reduce((a, b) => a + b.wasted, 0), 0),
      riskSkus: risky.length,
      riskValue: risky.reduce((s, i) => s + i.riskBatches.filter((b) => b.endDay <= c.riskDays).reduce((a, b) => a + b.wasted, 0) * i.unitValue, 0),
      belowMin: items.filter((i) => i.belowMin).length,
      lostCases: items.reduce((s, i) => s + i.lostBeforeLead, 0),
      sellable: items.reduce((s, i) => s + i.sellableNow, 0),
    },
  };
}

export const fmt = (x, d = 0) =>
  x == null || Number.isNaN(Number(x)) ? '—' : x === Infinity ? '∞' : Number(x).toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');
export const fmtMoney = (x) => `₪${fmt(x, 0)}`;
export const rel = (d) => (d == null ? '' : d < 0 ? `לפני ${-d} ימים` : d === 0 ? 'היום' : `בעוד ${d} ימים`);
export const monthLabel = (ym) => `${['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'][+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`;
