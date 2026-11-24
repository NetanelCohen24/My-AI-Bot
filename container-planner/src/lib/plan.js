/**
 * Container planning engine (pure functions).
 *
 * For every product we project stock day-by-day from today:
 *     stock(t) = on-hand − daily_demand × t + containers already on the way that arrived by t
 * and derive:
 *   - stockout date        first day projected stock hits 0
 *   - order-by date        (first day stock drops below safety stock) − lead time
 *   - unavoidable shortage days of zero stock before a container ordered today could land
 * Then per supplier: when the next container must be ordered, what to put in it,
 * and how full it is.
 */

export const DEFAULT_SETTINGS = {
  leadDays: 90,       // order → in warehouse (production + sea + customs), used when a row has none
  safetyDays: 30,     // safety stock, in days of demand
  cycleDays: 60,      // how long each container should cover until the next one
  warnDays: 21,       // "order soon" window
  horizonDays: 540,
  fillContainer: true,
  containers: [
    { name: "20'", cbm: 28 },
    { name: "40'", cbm: 58 },
    { name: "40' HC", cbm: 68 },
  ],
};

export const STATUS = {
  out: { label: 'אזל עכשיו', color: '#FF3B5C', rank: 0 },
  late: { label: 'יחסר – מאוחר מדי', color: '#FF3B5C', rank: 1 },
  order: { label: 'להזמין עכשיו', color: '#F59E0B', rank: 2 },
  soon: { label: 'להזמין בקרוב', color: '#FBBF24', rank: 3 },
  ok: { label: 'מכוסה', color: '#10B981', rank: 4 },
  nodemand: { label: 'ללא מכירות', color: '#64748B', rank: 5 },
};

const DAY = 86400000;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * DAY).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / DAY);

/** Monthly forecast: weighted average of the last 3 months (3:2:1), trend vs. the 3 before. */
export function forecast(item) {
  const h = (item.history || []).filter((x) => x != null && !Number.isNaN(x));
  let monthly;
  let trend = null;
  if (h.length >= 3) {
    const [a, b, c] = h.slice(-3);
    monthly = (a * 1 + b * 2 + c * 3) / 6;
    if (h.length >= 6) {
      const prev = h.slice(-6, -3).reduce((s, x) => s + x, 0) / 3;
      const last = h.slice(-3).reduce((s, x) => s + x, 0) / 3;
      trend = prev > 0 ? last / prev - 1 : null;
    }
  } else if (h.length) {
    monthly = h.reduce((s, x) => s + x, 0) / h.length;
  } else {
    monthly = Number(item.avgMonthly || 0);
  }
  return { monthly, daily: monthly / 30.4, trend };
}

/** Day-by-day projection. incoming: [{qty, eta}] for this sku. */
export function project(stock, daily, incoming, today, horizon) {
  const arrivals = new Map();
  for (const inc of incoming) {
    const d = Math.max(0, diffDays(inc.eta, today));
    arrivals.set(d, (arrivals.get(d) || 0) + Number(inc.qty || 0));
  }
  const out = new Array(horizon + 1);
  let s = Number(stock || 0);
  for (let t = 0; t <= horizon; t++) {
    s += arrivals.get(t) || 0;
    if (t > 0) s -= daily;
    out[t] = s;
  }
  return out;
}

export function analyzeItem(item, incomingAll, cfg, today = todayISO()) {
  const { monthly, daily, trend } = forecast(item);
  const lead = Number(item.leadDays || cfg.leadDays);
  const incoming = incomingAll.filter((x) => x.sku === item.sku && diffDays(x.eta, today) >= -7);
  const onTheWay = incoming.reduce((s, x) => s + Number(x.qty || 0), 0);
  const H = cfg.horizonDays;
  const proj = project(item.stock, daily, incoming, today, H);
  const safetyQty = daily * cfg.safetyDays;

  let stockoutDay = null;
  let belowSafetyDay = null;
  for (let t = 0; t <= H; t++) {
    if (belowSafetyDay == null && proj[t] < safetyQty) belowSafetyDay = t;
    if (stockoutDay == null && proj[t] <= 0) { stockoutDay = t; break; }
  }
  // Days with no stock before a container ordered today could arrive.
  let shortageDays = 0;
  for (let t = 0; t < Math.min(lead, H); t++) if (proj[t] <= 0) shortageDays++;
  const orderByDay = belowSafetyDay == null ? null : belowSafetyDay - lead;

  let status;
  if (daily <= 0) status = 'nodemand';
  else if (Number(item.stock) <= 0) status = 'out';
  else if (shortageDays > 0) status = 'late';
  else if (orderByDay != null && orderByDay <= 0) status = 'order';
  else if (orderByDay != null && orderByDay <= cfg.warnDays) status = 'soon';
  else status = 'ok';

  return {
    ...item, monthly, daily, trend, lead, incoming, onTheWay, proj, safetyQty,
    coverDays: daily > 0 ? Math.max(0, item.stock) / daily : Infinity,
    stockoutDay, stockoutDate: stockoutDay == null ? null : addDays(today, stockoutDay),
    orderByDay, orderByDate: orderByDay == null ? null : addDays(today, Math.max(orderByDay, 0)),
    shortageDays, status,
    lostUnits: shortageDays * daily,
  };
}

/** Pick containers for a volume: as many 40'HC as needed, last one the smallest that fits. */
export function chooseContainers(cbm, types) {
  if (cbm <= 0) return { list: [], capacity: 0 };
  const sorted = [...types].sort((a, b) => a.cbm - b.cbm);
  const big = sorted.at(-1);
  const list = [];
  let rem = cbm;
  while (rem > big.cbm) { list.push(big); rem -= big.cbm; }
  list.push(sorted.find((c) => c.cbm >= rem) || big);
  return { list, capacity: list.reduce((s, c) => s + c.cbm, 0) };
}

/**
 * Container plan for one supplier.
 * Order date = earliest order-by among its items (today if already late).
 * Each line covers cycle + safety days from arrival, rounded to cartons / MOQ.
 * Optionally tops up the last container with the items that would run out first.
 */
export function supplierPlan(supplier, items, cfg, today = todayISO()) {
  const live = items.filter((i) => i.daily > 0);
  if (!live.length) return null;
  const ob = live.map((i) => i.orderByDay).filter((x) => x != null);
  if (!ob.length) return null;
  const orderDay = Math.max(0, Math.min(...ob));
  if (orderDay > cfg.horizonDays - Math.max(...live.map((i) => i.lead))) return null;
  const lead = Math.max(...live.map((i) => i.lead));
  const arrivalDay = orderDay + lead;

  const lines = live.map((i) => {
    const atArrival = Math.max(0, i.proj[Math.min(arrivalDay, i.proj.length - 1)]);
    const target = i.daily * (cfg.cycleDays + cfg.safetyDays);
    const need = Math.max(0, target - atArrival);
    const upc = Math.max(1, Number(i.unitsPerCarton || 1));
    let cartons = Math.ceil(need / upc);
    if (cartons > 0 && i.moq) cartons = Math.max(cartons, Math.ceil(Number(i.moq) / upc));
    return { item: i, atArrival, need, upc, cbmCarton: Number(i.cbmPerCarton || 0), cartons, extra: 0 };
  });

  const vol = () => lines.reduce((s, l) => s + (l.cartons + l.extra) * l.cbmCarton, 0);
  const needCbm = vol();
  let { list, capacity } = chooseContainers(needCbm, cfg.containers);

  if (cfg.fillContainer && capacity > 0 && lines.some((l) => l.cbmCarton > 0)) {
    // Greedy top-up: one carton at a time to the line with the lowest cover after arrival.
    const cover = (l) => (l.atArrival + (l.cartons + l.extra) * l.upc) / l.item.daily;
    for (let guard = 0; guard < 5000; guard++) {
      const free = capacity - vol();
      const cands = lines.filter((l) => l.cbmCarton > 0 && l.cbmCarton <= free);
      if (!cands.length) break;
      cands.sort((a, b) => cover(a) - cover(b));
      cands[0].extra++;
    }
  }

  const finalLines = lines
    .map((l) => ({
      ...l,
      qty: (l.cartons + l.extra) * l.upc,
      cbm: (l.cartons + l.extra) * l.cbmCarton,
      coverAfter: (l.atArrival + (l.cartons + l.extra) * l.upc) / l.item.daily,
      value: (l.cartons + l.extra) * l.upc * Number(l.item.cost || 0),
    }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => a.item.orderByDay - b.item.orderByDay);

  const totalCbm = finalLines.reduce((s, l) => s + l.cbm, 0);
  return {
    supplier, orderDay, orderDate: addDays(today, orderDay), arrivalDay, arrivalDate: addDays(today, arrivalDay), lead,
    lines: finalLines, needCbm, totalCbm, containers: list, capacity,
    utilization: capacity ? totalCbm / capacity : null,
    missingCbm: finalLines.some((l) => !l.cbmCarton),
    value: finalLines.reduce((s, l) => s + l.value, 0),
    urgent: live.some((i) => i.status === 'late' || i.status === 'out'),
  };
}

export function buildPlan(data, cfg = DEFAULT_SETTINGS, today = todayISO()) {
  const items = data.items.map((i) => analyzeItem(i, data.incoming || [], cfg, today));
  const bySup = new Map();
  for (const i of items) {
    const k = i.supplier || 'ללא ספק';
    if (!bySup.has(k)) bySup.set(k, []);
    bySup.get(k).push(i);
  }
  const plans = [...bySup.entries()].map(([s, list]) => supplierPlan(s, list, cfg, today)).filter(Boolean)
    .sort((a, b) => a.orderDay - b.orderDay);
  const count = (s) => items.filter((i) => i.status === s).length;
  return {
    items, plans, today,
    kpis: {
      skus: items.length,
      suppliers: bySup.size,
      out: count('out'), late: count('late'), order: count('order'), soon: count('soon'), ok: count('ok'),
      containersNow: plans.filter((p) => p.orderDay <= 0).reduce((s, p) => s + p.containers.length, 0),
      containers90: plans.filter((p) => p.orderDay <= 90).reduce((s, p) => s + p.containers.length, 0),
      lostUnits: items.reduce((s, i) => s + i.lostUnits, 0),
      lostValue: items.reduce((s, i) => s + i.lostUnits * Number(i.price || i.cost || 0), 0),
      stockValue: items.reduce((s, i) => s + Math.max(0, i.stock) * Number(i.cost || 0), 0),
      incomingUnits: items.reduce((s, i) => s + i.onTheWay, 0),
    },
  };
}

export const fmt = (x, d = 0) =>
  x == null || Number.isNaN(Number(x)) ? '—' : x === Infinity ? '∞' : Number(x).toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');
export const fmtMoney = (x) => `₪${fmt(x, 0)}`;
export const relDays = (d) => (d == null ? '' : d <= 0 ? (d === 0 ? 'היום' : `לפני ${-d} ימים`) : `בעוד ${d} ימים`);
