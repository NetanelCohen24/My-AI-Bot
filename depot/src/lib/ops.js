/**
 * Business operations. Each takes the current in-memory db snapshot + a backend,
 * validates, then writes rows. The UI reloads from the backend afterwards.
 */
import { fefoAllocate, lotBalances, nextNumber, todayISO, orderAvailability, ORDER_STATUS } from './inventory.js';

const now = () => new Date().toISOString();
const who = (be) => be.user?.email || '';

/** Find or create a lot for product+lot_no (+expiry). */
async function ensureLot(db, be, product_id, lot_no, expiry, cache) {
  const no = (lot_no || '').trim() || `L${todayISO().replace(/-/g, '')}`;
  const key = `${product_id}|${no}`;
  if (cache.has(key)) return cache.get(key);
  let lot = db.lots.find((l) => l.product_id === product_id && l.lot_no === no);
  if (!lot) [lot] = await be.insert('lots', [{ product_id, lot_no: no, expiry: expiry || null, received_at: now() }]);
  cache.set(key, lot);
  return lot;
}

export async function receiveGoods(db, be, { supplier_id, po_id, lines, note, type = 'receipt' }) {
  const valid = lines.filter((l) => l.product_id && Number(l.qty) > 0);
  if (!valid.length) throw new Error('אין שורות לקליטה');
  for (const l of valid) {
    const p = db.products.find((x) => x.id === l.product_id);
    if (p?.track_expiry && !l.expiry) throw new Error(`חסר תאריך תפוגה עבור ${p.name}`);
  }
  const cache = new Map();
  const moves = [];
  for (const l of valid) {
    const lot = await ensureLot(db, be, l.product_id, l.lot_no, l.expiry, cache);
    moves.push({ ts: now(), type, product_id: l.product_id, lot_id: lot.id, qty: Number(l.qty), ref_type: po_id ? 'po' : 'supplier', ref_id: po_id || supplier_id || null, note: note || '', user_email: who(be) });
  }
  await be.insert('movements', moves);
  if (po_id) {
    for (const ln of db.po_lines.filter((x) => x.po_id === po_id)) {
      const got = valid.filter((v) => v.product_id === ln.product_id).reduce((s, v) => s + Number(v.qty), 0);
      if (got) await be.update('po_lines', ln.id, { received_qty: Number(ln.received_qty || 0) + got });
    }
    await be.update('purchase_orders', po_id, { status: 'received', received_at: now() });
  }
  return moves.length;
}

export async function createOrder(db, be, { customer_id, lines, due_date, note, status = 'confirmed' }) {
  const valid = lines.filter((l) => l.product_id && Number(l.qty) > 0);
  if (!customer_id) throw new Error('יש לבחור לקוח');
  if (!valid.length) throw new Error('ההזמנה ריקה');
  const [order] = await be.insert('orders', [{
    number: nextNumber(db.orders, 'SO'), customer_id, status, due_date: due_date || todayISO(), note: note || '', created_at: now(), user_email: who(be),
  }]);
  await be.insert('order_lines', valid.map((l) => ({ order_id: order.id, product_id: l.product_id, qty: Number(l.qty), price: Number(l.price || 0) })));
  return order;
}

export async function setOrderStatus(db, be, order, status) {
  if (order.status === 'shipped') throw new Error('הזמנה שנשלחה אינה ניתנת לשינוי');
  return be.update('orders', order.id, { status });
}

/** Ship: FEFO-allocate every line, all-or-nothing. */
export async function shipOrder(db, be, order) {
  if (!ORDER_STATUS[order.status]?.reserves && order.status !== 'draft') throw new Error('ניתן לשלוח רק הזמנה פתוחה');
  const lines = db.order_lines.filter((l) => l.order_id === order.id);
  const avail = orderAvailability(order, lines, db);
  const short = avail.filter((a) => !a.ok);
  if (short.length) {
    const names = short.map((s) => `${db.products.find((p) => p.id === s.product_id)?.name} (חסר ${Number(s.qty) - Math.max(0, s.free)})`);
    throw new Error(`אין מספיק מלאי: ${names.join(', ')}`);
  }
  const bal = lotBalances(db.movements);
  const moves = [];
  for (const ln of lines) {
    const { picks, short: s } = fefoAllocate(ln.product_id, Number(ln.qty), db.lots, bal, todayISO());
    if (s > 0) throw new Error('אין מספיק מלאי בתוקף');
    for (const p of picks) {
      bal.set(p.lot_id, bal.get(p.lot_id) - p.qty);
      moves.push({ ts: now(), type: 'shipment', product_id: ln.product_id, lot_id: p.lot_id, qty: -p.qty, ref_type: 'order', ref_id: order.id, note: order.number, user_email: who(be) });
    }
  }
  await be.insert('movements', moves);
  await be.update('orders', order.id, { status: 'shipped', shipped_at: now() });
  return moves;
}

/** Physical count: set lot to counted quantity, record the delta. */
export async function recordCount(db, be, entries, note) {
  const bal = lotBalances(db.movements);
  const cache = new Map();
  const moves = [];
  for (const e of entries) {
    if (e.counted === '' || e.counted == null) continue;
    let lotId = e.lot_id;
    if (!lotId) lotId = (await ensureLot(db, be, e.product_id, e.lot_no, e.expiry, cache)).id;
    const diff = Number(e.counted) - (bal.get(lotId) || 0);
    if (diff !== 0) moves.push({ ts: now(), type: 'count', product_id: e.product_id, lot_id: lotId, qty: diff, ref_type: 'count', note: note || 'ספירת מלאי', user_email: who(be) });
  }
  if (moves.length) await be.insert('movements', moves);
  return moves.length;
}

export async function writeOff(db, be, { lot, qty, reason }) {
  const bal = lotBalances(db.movements).get(lot.id) || 0;
  const q = Math.min(Number(qty), bal);
  if (q <= 0) throw new Error('אין כמות לגריעה');
  await be.insert('movements', [{ ts: now(), type: 'writeoff', product_id: lot.product_id, lot_id: lot.id, qty: -q, ref_type: 'writeoff', note: reason || 'פג תוקף', user_email: who(be) }]);
}

export async function createPO(db, be, { supplier_id, lines, note, status = 'sent' }) {
  const valid = lines.filter((l) => l.product_id && Number(l.qty) > 0);
  if (!supplier_id) throw new Error('יש לבחור ספק');
  if (!valid.length) throw new Error('אין שורות בהזמנה');
  const [po] = await be.insert('purchase_orders', [{ number: nextNumber(db.purchase_orders, 'PO'), supplier_id, status, note: note || '', created_at: now(), user_email: who(be) }]);
  await be.insert('po_lines', valid.map((l) => ({ po_id: po.id, product_id: l.product_id, qty: Number(l.qty), received_qty: 0, cost: Number(l.cost || 0) })));
  return po;
}

export async function saveEntity(be, table, row) {
  const { id, ...rest } = row;
  if (id) return be.update(table, id, rest);
  const [r] = await be.insert(table, [rest]);
  return r;
}

export async function deleteEntity(db, be, table, id) {
  const used = {
    products: () => db.movements.some((m) => m.product_id === id) || db.order_lines.some((l) => l.product_id === id),
    customers: () => db.orders.some((o) => o.customer_id === id),
    suppliers: () => db.purchase_orders.some((p) => p.supplier_id === id) || db.products.some((p) => p.supplier_id === id),
  }[table];
  if (used?.()) throw new Error('לא ניתן למחוק – קיימות תנועות או הזמנות מקושרות. אפשר לסמן כלא פעיל.');
  await be.remove(table, id);
}
