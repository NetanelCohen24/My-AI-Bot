import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fefoAllocate, lotBalances, stockSummary, orderAvailability } from '../src/lib/inventory.js';
import { receiveGoods, shipOrder, createOrder, recordCount } from '../src/lib/ops.js';
import { generateDemo } from '../src/lib/mock.js';
import { emptyDb } from '../src/lib/backend.js';

// In-memory backend with the same API as the real ones.
function memBackend(init = emptyDb()) {
  const data = structuredClone(init);
  let n = 0;
  return {
    data, user: { email: 't@test' },
    async insert(t, rows) { const out = rows.map((r) => ({ id: `${t}-${++n}`, created_at: new Date().toISOString(), ...r })); data[t].push(...out); return out; },
    async update(t, id, patch) { const r = data[t].find((x) => x.id === id); Object.assign(r, patch); return r; },
    async remove(t, id) { data[t] = data[t].filter((x) => x.id !== id); },
  };
}
const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('FEFO picks earliest valid expiry and skips expired lots', () => {
  const lots = [
    { id: 'a', product_id: 'p', lot_no: 'A', expiry: d(-1) },
    { id: 'b', product_id: 'p', lot_no: 'B', expiry: d(20) },
    { id: 'c', product_id: 'p', lot_no: 'C', expiry: d(5) },
  ];
  const bal = new Map([['a', 50], ['b', 10], ['c', 4]]);
  const { picks, short } = fefoAllocate('p', 8, lots, bal);
  assert.deepEqual(picks.map((x) => [x.lot_id, x.qty]), [['c', 4], ['b', 4]]);
  assert.equal(short, 0);
  assert.equal(fefoAllocate('p', 20, lots, bal).short, 6);
});

test('receive → order → ship keeps the ledger consistent', async () => {
  const be = memBackend();
  const [sup] = await be.insert('suppliers', [{ name: 'S', lead_days: 2 }]);
  const [cus] = await be.insert('customers', [{ name: 'C' }]);
  const [p] = await be.insert('products', [{ sku: 'X1', name: 'Milk', track_expiry: true, min_qty: 5, supplier_id: sup.id, cost: 2 }]);
  await assert.rejects(receiveGoods(be.data, be, { lines: [{ product_id: p.id, qty: 10 }] }), /תפוגה/);
  await receiveGoods(be.data, be, { supplier_id: sup.id, lines: [{ product_id: p.id, qty: 10, lot_no: 'L1', expiry: d(10) }] });
  await receiveGoods(be.data, be, { supplier_id: sup.id, lines: [{ product_id: p.id, qty: 5, lot_no: 'L0', expiry: d(3) }] });
  const o = await createOrder(be.data, be, { customer_id: cus.id, lines: [{ product_id: p.id, qty: 7, price: 3 }] });
  let s = stockSummary(be.data).find((x) => x.product.id === p.id);
  assert.equal(s.usable, 15); assert.equal(s.reserved, 7); assert.equal(s.available, 8);
  await shipOrder(be.data, be, be.data.orders.find((x) => x.id === o.id));
  s = stockSummary(be.data).find((x) => x.product.id === p.id);
  assert.equal(s.usable, 8); assert.equal(s.reserved, 0);
  const bal = lotBalances(be.data.movements);
  const l0 = be.data.lots.find((l) => l.lot_no === 'L0');
  assert.equal(bal.get(l0.id), 0, 'shorter-dated lot ships first');
  const o2 = await createOrder(be.data, be, { customer_id: cus.id, lines: [{ product_id: p.id, qty: 50 }] });
  await assert.rejects(shipOrder(be.data, be, be.data.orders.find((x) => x.id === o2.id)), /אין מספיק מלאי/);
});

test('count records only the difference', async () => {
  const be = memBackend();
  const [p] = await be.insert('products', [{ sku: 'Y', name: 'Y' }]);
  await receiveGoods(be.data, be, { lines: [{ product_id: p.id, qty: 20, lot_no: 'A' }] });
  const lot = be.data.lots[0];
  const n = await recordCount(be.data, be, [{ product_id: p.id, lot_id: lot.id, counted: 17 }]);
  assert.equal(n, 1);
  assert.equal(lotBalances(be.data.movements).get(lot.id), 17);
});

test('demo data has the intended alert scenarios', () => {
  const db = generateDemo();
  const s = stockSummary(db);
  assert.ok(s.some((x) => x.status === 'out'));
  assert.ok(s.some((x) => x.status === 'low'));
  assert.ok(s.some((x) => x.expiredQty > 0));
  assert.ok(s.some((x) => x.suggest > 0));
  const open = db.orders.filter((o) => o.status === 'confirmed');
  assert.ok(open.some((o) => orderAvailability(o, db.order_lines.filter((l) => l.order_id === o.id), db).some((a) => !a.ok)));
  for (const v of lotBalances(db.movements).values()) assert.ok(v >= 0, 'no negative lots');
});
