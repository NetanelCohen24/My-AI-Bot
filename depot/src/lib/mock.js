/**
 * Demo dataset for a food & grocery distributor: 60 days of receipts and shipments,
 * with built-in situations to explore — items below minimum, out of stock, lots that
 * expire this week, an expired lot still on the shelf, open orders that can't be fully
 * filled, and an open purchase order.
 */
import { emptyDb } from './backend.js';

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
let n = 0;
const id = (p) => `${p}-${(++n).toString(36).padStart(5, '0')}`;
const DAY = 86400000;
const iso = (d) => new Date(d).toISOString();
const day = (d) => iso(d).slice(0, 10);

const SUPPLIERS = [
  ['מחלבות הגליל בע״מ', '04-6801234', 'orders@galil-dairy.example', 2],
  ['חטיפי הדרום', '08-6409876', 'sales@darom-snacks.example', 4],
  ['בית הקפה המרכזי', '03-5551212', 'b2b@coffee-house.example', 6],
  ['משקאות הצפון', '04-8123456', 'orders@north-drinks.example', 3],
];

// name, category, unit, cost, price, min, reorder, supplierIdx, expiryDays (0 = none), dailyDemand
const PRODUCTS = [
  ['חלב 3% קרטון 1 ל׳', 'מוצרי חלב', 'קרטון', 4.1, 5.9, 120, 240, 0, 12, 34],
  ['קוטג׳ 5% 250 גר׳', 'מוצרי חלב', 'יח׳', 4.6, 6.5, 80, 160, 0, 18, 22],
  ['יוגורט טבעי 200 גר׳', 'מוצרי חלב', 'יח׳', 2.2, 3.4, 60, 150, 0, 21, 16],
  ['גבינה צהובה 28% 200 גר׳', 'מוצרי חלב', 'יח׳', 9.8, 13.9, 40, 80, 0, 45, 9],
  ['חמאה 200 גר׳', 'מוצרי חלב', 'יח׳', 6.9, 9.5, 30, 60, 0, 60, 6],
  ['במבה 80 גר׳ (מארז 10)', 'חטיפים', 'מארז', 21, 29, 40, 100, 1, 180, 11],
  ['ביסלי גריל 70 גר׳ (מארז 10)', 'חטיפים', 'מארז', 23, 31, 30, 80, 1, 180, 8],
  ['צ׳יפס תפו״א 50 גר׳ (מארז 20)', 'חטיפים', 'מארז', 38, 52, 20, 50, 1, 150, 5],
  ['וופל שוקולד 500 גר׳', 'חטיפים', 'יח׳', 8.4, 12.9, 25, 60, 1, 240, 6],
  ['קפה נמס 200 גר׳', 'קפה ותה', 'יח׳', 19, 27.9, 20, 48, 2, 540, 4],
  ['קפה טורקי 250 גר׳', 'קפה ותה', 'יח׳', 11.5, 16.9, 25, 60, 2, 365, 5],
  ['תה ירוק 25 שקיות', 'קפה ותה', 'יח׳', 7.2, 10.9, 15, 40, 2, 720, 2],
  ['מים מינרליים 6×1.5 ל׳', 'משקאות', 'שישייה', 8.5, 12.9, 60, 150, 3, 365, 18],
  ['משקה אנרגיה 250 מ״ל (מגש 24)', 'משקאות', 'מגש', 72, 99, 10, 24, 3, 300, 2.5],
  ['מיץ תפוזים 1 ל׳', 'משקאות', 'יח׳', 6.2, 9.4, 40, 90, 3, 30, 10],
  ['סודה 1.5 ל׳ (שישייה)', 'משקאות', 'שישייה', 9.9, 14.5, 30, 60, 3, 270, 7],
  ['שקיות אשפה 50 יח׳', 'כללי', 'יח׳', 5.5, 8.9, 20, 50, null, 0, 3],
  ['נייר טואלט 32 גלילים', 'כללי', 'חבילה', 29, 42, 15, 40, null, 0, 3.5],
];

const CUSTOMERS = [
  ['C101', 'מכולת השכונה', 'עצמאי', 'חיפה', 'צפון', '050-1111111'],
  ['C102', 'סופר כרמל', 'עצמאי', 'חיפה', 'צפון', '050-2222222'],
  ['C103', 'מינימרקט הגליל', 'עצמאי', 'כרמיאל', 'צפון', '052-3333333'],
  ['C201', 'סופר דיל – רמת גן', 'סופר דיל', 'רמת גן', 'מרכז', '03-6700001'],
  ['C202', 'סופר דיל – גבעתיים', 'סופר דיל', 'גבעתיים', 'מרכז', '03-6700002'],
  ['C203', 'פיצוציית הלילה', 'עצמאי', 'תל אביב', 'מרכז', '054-4444444'],
  ['C204', 'מעדניית השוק', 'עצמאי', 'תל אביב', 'מרכז', '054-5555555'],
  ['C205', 'קיוסק התחנה', 'עצמאי', 'חולון', 'מרכז', '053-6666666'],
  ['C301', 'שוק העיר – ראשל״צ', 'שוק העיר', 'ראשון לציון', 'מרכז', '03-9600001'],
  ['C302', 'שוק העיר – רחובות', 'שוק העיר', 'רחובות', 'מרכז', '08-9400002'],
  ['C401', 'מכולת הרים', 'עצמאי', 'ירושלים', 'ירושלים', '02-5000001'],
  ['C402', 'סופר בית שמש', 'עצמאי', 'בית שמש', 'ירושלים', '02-9900002'],
  ['C501', 'מרכול הנגב', 'עצמאי', 'באר שבע', 'דרום', '08-6200001'],
  ['C502', 'סופר הים', 'עצמאי', 'אשדוד', 'דרום', '08-8500002'],
];

export function generateDemo(seed = 7) {
  n = 0;
  const r = rng(seed);
  const db = emptyDb();
  const now = Date.now();
  const start = now - 60 * DAY;

  db.suppliers = SUPPLIERS.map(([name, phone, email, lead]) => ({ id: id('sup'), name, phone, email, lead_days: lead, active: true }));
  db.customers = CUSTOMERS.map(([code, name, chain, city, region, phone]) => ({ id: id('cus'), code, name, chain, city, region, phone, active: true }));
  db.products = PRODUCTS.map((p, i) => ({
    id: id('prd'), sku: `D${String(1001 + i)}`, barcode: `72900${String(10000000 + i * 7919).slice(0, 8)}`,
    name: p[0], category: p[1], unit: p[2], cost: p[3], price: p[4], min_qty: p[5], reorder_qty: p[6],
    supplier_id: p[7] == null ? db.suppliers[3].id : db.suppliers[p[7]].id, track_expiry: p[8] > 0, shelf_days: p[8], active: true,
  }));
  const meta = new Map(db.products.map((p, i) => [p.id, { demand: PRODUCTS[i][9], shelf: PRODUCTS[i][8] }]));

  // Running per-lot balances while simulating.
  const lotQty = new Map();
  const addLot = (p, t, qty, type = 'receipt') => {
    const m = meta.get(p.id);
    const lot = {
      id: id('lot'), product_id: p.id, lot_no: `${p.sku}-${day(t).slice(2).replace(/-/g, '')}`,
      expiry: m.shelf ? day(t + m.shelf * DAY) : null, received_at: iso(t),
    };
    db.lots.push(lot);
    lotQty.set(lot.id, qty);
    db.movements.push({ id: id('mv'), ts: iso(t), type, product_id: p.id, lot_id: lot.id, qty, ref_type: 'supplier', ref_id: p.supplier_id, note: '', user_email: 'demo' });
    return lot;
  };
  const stock = (pid, t) => db.lots.filter((l) => l.product_id === pid && lotQty.get(l.id) > 0 && (!l.expiry || l.expiry >= day(t)))
    .sort((a, b) => (a.expiry || '9').localeCompare(b.expiry || '9'));

  // Opening stock.
  for (const p of db.products) addLot(p, start - 2 * DAY, Math.round(p.min_qty * 1.3 + r() * p.min_qty), 'opening');

  let soNum = 0;
  let poNum = 0;
  for (let d = 0; d < 60; d++) {
    const t = start + d * DAY + 8 * 3600000;
    const dow = new Date(t).getDay();
    if (dow === 6) continue;
    // Expired stock is written off the morning after it expires.
    for (const l of db.lots) {
      const q = lotQty.get(l.id);
      if (q > 0 && l.expiry && l.expiry < day(t)) {
        lotQty.set(l.id, 0);
        db.movements.push({ id: id('mv'), ts: iso(t - 3600000), type: 'writeoff', product_id: l.product_id, lot_id: l.id, qty: -q, ref_type: 'writeoff', note: 'פג תוקף', user_email: 'demo' });
      }
    }
    // Replenishment when low (every supplier delivers on their own rhythm).
    for (const p of db.products) {
      const onHand = stock(p.id, t).reduce((s, l) => s + lotQty.get(l.id), 0);
      // Scenario products are starved near the end to create alerts.
      const starve = d > 48 && ['D1006', 'D1010', 'D1014', 'D1015'].includes(p.sku);
      if (!starve && onHand < p.min_qty * 1.2 && r() < 0.7) {
        const po = { id: id('po'), number: `PO-${String(++poNum).padStart(4, '0')}`, supplier_id: p.supplier_id, status: 'received', note: '', created_at: iso(t - 2 * DAY), received_at: iso(t), user_email: 'demo' };
        const qty = p.reorder_qty + Math.round(r() * p.min_qty);
        db.purchase_orders.push(po);
        db.po_lines.push({ id: id('pol'), po_id: po.id, product_id: p.id, qty, received_qty: qty, cost: p.cost });
        const lot = addLot(p, t, qty);
        db.movements.at(-1).ref_type = 'po';
        db.movements.at(-1).ref_id = po.id;
        void lot;
      }
    }
    // Customer orders.
    const nOrders = 3 + Math.floor(r() * 4) + (dow === 4 ? 3 : 0);
    for (let k = 0; k < nOrders; k++) {
      const c = db.customers[Math.floor(r() * db.customers.length)];
      const order = { id: id('so'), number: `SO-${String(++soNum).padStart(4, '0')}`, customer_id: c.id, status: 'shipped', due_date: day(t), note: '', created_at: iso(t - 3600000 * (2 + r() * 20)), shipped_at: iso(t + 3600000 * 3), user_email: 'demo' };
      const picks = db.products.filter(() => r() < 0.35);
      if (!picks.length) continue;
      let any = false;
      for (const p of picks) {
        const want = Math.max(1, Math.round((meta.get(p.id).demand / 1.7) * (0.5 + r())));
        let left = want;
        const lots = stock(p.id, t);
        const avail = lots.reduce((s, l) => s + lotQty.get(l.id), 0);
        const qty = Math.min(want, avail);
        if (qty <= 0) continue;
        any = true;
        db.order_lines.push({ id: id('sol'), order_id: order.id, product_id: p.id, qty, price: p.price });
        left = qty;
        for (const l of lots) {
          if (left <= 0) break;
          const take = Math.min(left, lotQty.get(l.id));
          lotQty.set(l.id, lotQty.get(l.id) - take);
          left -= take;
          db.movements.push({ id: id('mv'), ts: order.shipped_at, type: 'shipment', product_id: p.id, lot_id: l.id, qty: -take, ref_type: 'order', ref_id: order.id, note: order.number, user_email: 'demo' });
        }
      }
      if (any) db.orders.push(order);
    }
    // Occasional shrink found during counts.
    if (r() < 0.08) {
      const p = db.products[Math.floor(r() * db.products.length)];
      const l = stock(p.id, t)[0];
      if (l && lotQty.get(l.id) > 3) {
        lotQty.set(l.id, lotQty.get(l.id) - 2);
        db.movements.push({ id: id('mv'), ts: iso(t + 7200000), type: 'count', product_id: p.id, lot_id: l.id, qty: -2, ref_type: 'count', note: 'ספירה תקופתית', user_email: 'demo' });
      }
    }
  }

  // ── Scenario injections relative to today ──
  const T = now;
  const byName = (sku) => db.products.find((p) => p.sku === sku);
  // Yogurt: a lot that expires in 3 days with plenty still in stock.
  const yog = byName('D1003');
  const yl = addLot(yog, T - 18 * DAY, 90);
  yl.expiry = day(T + 3 * DAY);
  // Orange juice: an expired lot still on the shelf (must be written off).
  const oj = byName('D1015');
  const ol = addLot(oj, T - 35 * DAY, 26);
  ol.expiry = day(T - 2 * DAY);
  // Cottage: lot expiring in 6 days.
  const cot = byName('D1002');
  const cl = addLot(cot, T - 12 * DAY, 40);
  cl.expiry = day(T + 6 * DAY);

  // Open orders in different stages (these reserve stock).
  const mk = (cIdx, status, lines, hoursAgo, due = 1) => {
    const o = { id: id('so'), number: `SO-${String(++soNum).padStart(4, '0')}`, customer_id: db.customers[cIdx].id, status, due_date: day(T + due * DAY), note: '', created_at: iso(T - hoursAgo * 3600000), user_email: 'demo' };
    db.orders.push(o);
    for (const [sku, qty] of lines) { const p = byName(sku); db.order_lines.push({ id: id('sol'), order_id: o.id, product_id: p.id, qty, price: p.price }); }
  };
  mk(3, 'confirmed', [['D1001', 60], ['D1002', 30], ['D1013', 20]], 20);
  mk(8, 'picking', [['D1006', 25], ['D1007', 10], ['D1009', 8]], 6, 0);
  mk(1, 'confirmed', [['D1010', 30], ['D1011', 12]], 3);
  mk(12, 'confirmed', [['D1015', 40], ['D1003', 24]], 2);
  mk(5, 'draft', [['D1014', 4], ['D1016', 10]], 1, 2);

  // An open PO on its way.
  const po = { id: id('po'), number: `PO-${String(++poNum).padStart(4, '0')}`, supplier_id: db.suppliers[0].id, status: 'sent', note: 'אספקה מחר בבוקר', created_at: iso(T - 20 * 3600000), user_email: 'demo' };
  db.purchase_orders.push(po);
  db.po_lines.push({ id: id('pol'), po_id: po.id, product_id: byName('D1001').id, qty: 240, received_qty: 0, cost: 4.1 });
  db.po_lines.push({ id: id('pol'), po_id: po.id, product_id: byName('D1004').id, qty: 60, received_qty: 0, cost: 9.8 });

  return db;
}
