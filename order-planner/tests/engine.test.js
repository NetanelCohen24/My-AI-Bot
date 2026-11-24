import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProduct, analyzeAll, DEFAULTS, forecast } from '../src/lib/engine.js';
import { ingest, monthKey } from '../src/lib/ingest.js';
import { sampleSheets } from '../src/lib/sample.js';

const asOf = '2026-05-01';
const cfg = { ...DEFAULTS, asOf, salesEnd: '2026-04' };
const hist = (v) => Object.fromEntries(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'].map((m) => [m, v]));

test('weighted 3-month forecast ignores pre-filled future zeros', () => {
  const p = { history: { ...hist(100), '2026-05': 0, '2026-06': 0 } };
  assert.equal(Math.round(forecast(p, '2026-11-01', 'recent', '2026-04').monthly), 100);
});

test('FEFO: stock that will be blocked does not count as cover', () => {
  // 300 cases/month = ~10/day. 600 cases expire in 40 days (blocked at day 10): only ~100 sell.
  const p = { sku: 'A', name: 'A', history: hist(304), leadDays: 30, batches: [{ expiry: '2026-06-10', qty: 600 }, { expiry: '2027-06-01', qty: 300 }], blockDays: 30 };
  const r = analyzeProduct(p, cfg);
  assert.ok(r.riskQty > 450 && r.riskQty < 520, `risk ${r.riskQty}`);
  assert.ok(r.stockoutDay > 35 && r.stockoutDay < 45, `stockout day ${r.stockoutDay}`);
});

test('order-by = when stock falls below safety, minus lead time; short when it cannot arrive in time', () => {
  const ok = analyzeProduct({ sku: 'B', name: 'B', history: hist(304), leadDays: 30, batches: [{ expiry: null, qty: 3000 }] }, cfg);
  assert.equal(ok.status, 'ok');
  assert.ok(Math.abs(ok.orderByDay - (300 - 14 - 30)) <= 2, `orderBy ${ok.orderByDay}`);
  const short = analyzeProduct({ sku: 'C', name: 'C', history: hist(304), leadDays: 90, batches: [{ expiry: null, qty: 300 }] }, cfg);
  assert.equal(short.status, 'short');
  assert.ok(short.lostBeforeLead > 500);
  const out = analyzeProduct({ sku: 'D', name: 'D', history: hist(304), batches: [] }, cfg);
  assert.equal(out.status, 'out');
});

test('suggested order is capped by shelf life and rounded to pallets for imports', () => {
  const p = { sku: 'E', name: 'E', history: hist(912), leadDays: 60, origin: 'יבוא', casesPerPallet: 50, shelfLifeDays: 90, batches: [{ expiry: null, qty: 100 }] };
  const r = analyzeProduct(p, cfg);
  // ~30/day × (90×0.85 − 30) ≈ 1395 cap, then rounded up to full pallets of 50.
  assert.ok(r.suggest <= 1450 && r.suggest % 50 === 0, `suggest ${r.suggest}`);
});

test('month header parsing', () => {
  assert.equal(monthKey('Jan-25'), '2025-01');
  assert.equal(monthKey('01/2026'), '2026-01');
  assert.equal(monthKey(new Date(2025, 2, 1)), '2025-03');
  assert.equal(monthKey('ינואר 26'), '2026-01');
  assert.equal(monthKey('חומר'), null);
});

test('sample workbook ingests and produces every kind of alert', () => {
  const d = ingest(sampleSheets('2026-11-15'));
  assert.equal(d.products.length, 18);
  const r = analyzeAll(d, {});
  assert.equal(r.asOf, '2026-11-01');
  for (const k of ['out', 'short', 'order']) assert.ok(r.kpis[k] > 0, k);
  assert.ok(r.kpis.riskQty > 0 && r.kpis.expiredQty > 0);
  assert.ok(r.orders.some((o) => o.containers));
});
