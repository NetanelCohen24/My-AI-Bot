/**
 * Depot — pure inventory logic (no I/O). Everything is derived from the movement ledger:
 * stock is never stored, it is the sum of signed movements per lot.
 */

export const MOVE_TYPES = {
  receipt: { label: 'קליטה', sign: +1, color: '#10B981' },
  shipment: { label: 'משלוח ללקוח', sign: -1, color: '#38BDF8' },
  return: { label: 'החזרה מלקוח', sign: +1, color: '#A78BFA' },
  count: { label: 'ספירת מלאי', sign: 0, color: '#F59E0B' },
  adjust: { label: 'התאמה ידנית', sign: 0, color: '#F59E0B' },
  writeoff: { label: 'גריעה / פחת', sign: -1, color: '#FF3B5C' },
  opening: { label: 'יתרת פתיחה', sign: +1, color: '#64748B' },
};

export const ORDER_STATUS = {
  draft: { label: 'טיוטה', color: '#64748B', reserves: false },
  confirmed: { label: 'מאושרת', color: '#38BDF8', reserves: true },
  picking: { label: 'בליקוט', color: '#F59E0B', reserves: true },
  shipped: { label: 'נשלחה', color: '#10B981', reserves: false },
  cancelled: { label: 'בוטלה', color: '#FF3B5C', reserves: false },
};

export const PO_STATUS = {
  draft: { label: 'טיוטה', color: '#64748B', open: false },
  sent: { label: 'נשלחה לספק', color: '#38BDF8', open: true },
  received: { label: 'התקבלה', color: '#10B981', open: false },
  cancelled: { label: 'בוטלה', color: '#FF3B5C', open: false },
};

const DAY = 86400000;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / DAY);

/** lot_id → current quantity */
export function lotBalances(movements) {
  const m = new Map();
  for (const mv of movements) {
    if (!mv.lot_id) continue;
    m.set(mv.lot_id, (m.get(mv.lot_id) || 0) + Number(mv.qty));
  }
  return m;
}

export function expiryState(expiry, today = todayISO(), warnDays = 30) {
  if (!expiry) return 'none';
  const d = daysBetween(expiry, today);
  if (d < 0) return 'expired';
  if (d <= 7) return 'critical';
  if (d <= warnDays) return 'soon';
  return 'ok';
}

/**
 * First-Expired-First-Out allocation. Skips expired lots. Lots without expiry go last
 * (oldest receipt first). Returns { picks:[{lot_id, qty}], short }.
 */
export function fefoAllocate(productId, qty, lots, balances, today = todayISO()) {
  const candidates = lots
    .filter((l) => l.product_id === productId && (balances.get(l.id) || 0) > 0 && expiryState(l.expiry, today) !== 'expired')
    .sort((a, b) => {
      if (a.expiry && b.expiry) return a.expiry.localeCompare(b.expiry);
      if (a.expiry) return -1;
      if (b.expiry) return 1;
      return (a.received_at || '').localeCompare(b.received_at || '');
    });
  const picks = [];
  let left = qty;
  for (const l of candidates) {
    if (left <= 0) break;
    const take = Math.min(left, balances.get(l.id));
    picks.push({ lot_id: l.id, lot_no: l.lot_no, expiry: l.expiry, qty: take });
    left -= take;
  }
  return { picks, short: Math.max(0, left) };
}

/**
 * Per-product stock picture.
 * reserved  = open customer orders (confirmed/picking) not yet shipped
 * onOrder   = open purchase orders not yet received
 * avgDaily  = shipments in the last 30 days / 30
 * suggest   = reorder quantity when available+onOrder drops below min
 */
export function stockSummary(db, today = todayISO()) {
  const { products, lots, movements, orders, order_lines, purchase_orders, po_lines, suppliers } = db;
  const bal = lotBalances(movements);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const openOrders = new Set(orders.filter((o) => ORDER_STATUS[o.status]?.reserves).map((o) => o.id));
  const openPOs = new Set(purchase_orders.filter((p) => PO_STATUS[p.status]?.open).map((p) => p.id));
  const since = new Date(new Date(today).getTime() - 30 * DAY).toISOString();

  const agg = new Map(products.map((p) => [p.id, {
    onHand: 0, usable: 0, expiredQty: 0, reserved: 0, onOrder: 0, shipped30: 0, lots: [], nearestExpiry: null,
  }]));

  for (const l of lots) {
    const a = agg.get(l.product_id);
    if (!a) continue;
    const q = bal.get(l.id) || 0;
    if (q === 0) continue;
    const st = expiryState(l.expiry, today);
    a.onHand += q;
    if (st === 'expired') a.expiredQty += q; else a.usable += q;
    a.lots.push({ ...l, qty: q, state: st });
    if (l.expiry && st !== 'expired' && (!a.nearestExpiry || l.expiry < a.nearestExpiry)) a.nearestExpiry = l.expiry;
  }
  for (const ln of order_lines) if (openOrders.has(ln.order_id) && agg.has(ln.product_id)) agg.get(ln.product_id).reserved += Number(ln.qty);
  for (const ln of po_lines) if (openPOs.has(ln.po_id) && agg.has(ln.product_id)) agg.get(ln.product_id).onOrder += Number(ln.qty) - Number(ln.received_qty || 0);
  for (const mv of movements) if (mv.type === 'shipment' && mv.ts >= since && agg.has(mv.product_id)) agg.get(mv.product_id).shipped30 += -Number(mv.qty);

  return products.map((p) => {
    const a = agg.get(p.id);
    const available = a.usable - a.reserved;
    const avgDaily = a.shipped30 / 30;
    const sup = supplierById.get(p.supplier_id);
    const lead = Number(sup?.lead_days ?? 3);
    const min = Number(p.min_qty || 0);
    // Dynamic reorder point: the larger of the manual min and demand over lead time + 3 safety days.
    const reorderPoint = Math.max(min, Math.ceil(avgDaily * (lead + 3)));
    const position = available + a.onOrder;
    let suggest = 0;
    if (position < reorderPoint) {
      const target = reorderPoint + Math.max(Number(p.reorder_qty || 0), Math.ceil(avgDaily * 14));
      suggest = Math.ceil(target - position);
    }
    let status = 'ok';
    if (a.usable <= 0) status = 'out';
    else if (available < 0) status = 'over';
    else if (available < reorderPoint) status = 'low';
    a.lots.sort((x, y) => (x.expiry || '9999').localeCompare(y.expiry || '9999'));
    return {
      product: p, supplier: sup, ...a, available, avgDaily, reorderPoint, position, suggest, status,
      daysCover: avgDaily > 0 ? available / avgDaily : Infinity,
      value: a.usable * Number(p.cost || 0),
    };
  });
}

export const STOCK_STATUS = {
  out: { label: 'אזל', color: '#FF3B5C' },
  over: { label: 'חוסר להזמנות', color: '#FF3B5C' },
  low: { label: 'מתחת למינימום', color: '#F59E0B' },
  ok: { label: 'תקין', color: '#10B981' },
};

/** For an order: per line, can we ship it fully right now? */
export function orderAvailability(order, lines, db, today = todayISO()) {
  const bal = lotBalances(db.movements);
  // Stock already reserved by OTHER open orders that were created earlier gets priority.
  const earlier = new Set(db.orders
    .filter((o) => o.id !== order.id && ORDER_STATUS[o.status]?.reserves && (o.created_at || '') < (order.created_at || '~'))
    .map((o) => o.id));
  const reservedBefore = new Map();
  for (const ln of db.order_lines) if (earlier.has(ln.order_id)) reservedBefore.set(ln.product_id, (reservedBefore.get(ln.product_id) || 0) + Number(ln.qty));
  return lines.map((ln) => {
    const usable = db.lots
      .filter((l) => l.product_id === ln.product_id && expiryState(l.expiry, today) !== 'expired')
      .reduce((s, l) => s + Math.max(0, bal.get(l.id) || 0), 0);
    const free = usable - (reservedBefore.get(ln.product_id) || 0);
    return { ...ln, usable, free, ok: free >= Number(ln.qty) };
  });
}

export function nextNumber(rows, prefix) {
  let max = 0;
  for (const r of rows) {
    const m = String(r.number || '').match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export const fmt = (x, d = 0) =>
  x == null || Number.isNaN(Number(x)) ? '—' : Number(x).toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtMoney = (x) => `₪${fmt(x, 0)}`;
export const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');
export const fmtDateTime = (s) => (s ? `${fmtDate(s.slice(0, 10))} ${s.slice(11, 16)}` : '—');
