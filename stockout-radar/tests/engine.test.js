import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, DEFAULT_SETTINGS } from '../src/lib/engine.js';
import { generateMock } from '../src/lib/mockData.js';
import { normalizeDate } from '../src/lib/dates.js';
import { mapHeaders } from '../src/lib/parser.js';
import { buildTaskList } from '../src/lib/tasks.js';

const res = analyze(generateMock({ endDay: '2026-11-23' }), DEFAULT_SETTINGS);
const cell = (store, sku) => res.cells.find((c) => c.store === store && c.sku === sku);

test('detects every injected phantom-inventory scenario', () => {
  for (const [st, sku] of [['1021', '7290000042435'], ['4410', '7290110115302'], ['2201', '7290000176277'],
    ['5012', '7290004127329'], ['3180', '7290011194239'], ['1210', '7290000066318'], ['2240', '7290014758674']]) {
    assert.equal(cell(st, sku).status, 'phantom', `${st}/${sku}`);
  }
});

test('flags true OOS and demand spikes', () => {
  assert.equal(cell('3105', '7290000066318').status, 'oos');
  assert.equal(cell('5030', '7290018567074').status, 'spike');
  assert.equal(cell('4460', '7290011194239').status, 'spike');
});

test('sharp drops are critical', () => {
  assert.equal(cell('1102', '7290000066318').status, 'critical');
  assert.equal(cell('2215', '7290000042435').status, 'critical');
});

test('phantom requires inventory above threshold', () => {
  const strict = analyze(generateMock({ endDay: '2026-11-23' }), { ...DEFAULT_SETTINGS, invThreshold: 80 });
  assert.equal(strict.cells.filter((c) => c.status === 'phantom').length, 0);
});

test('most series stay healthy (false-positive guard)', () => {
  assert.ok(res.kpis.health > 0.8, `health ${res.kpis.health}`);
});

test('date normalisation', () => {
  assert.equal(normalizeDate('23/11/2026'), '2026-11-23');
  assert.equal(normalizeDate('2026-11-23'), '2026-11-23');
  assert.equal(normalizeDate('5.1.26'), '2026-01-05');
  assert.equal(normalizeDate(46349), '2026-11-23');
});

test('hebrew header mapping', () => {
  const m = mapHeaders(['תאריך', 'קוד סניף', 'שם רשת', 'ברקוד/מק"ט', 'שם מוצר', 'כמות מכירה יומית', 'יתרת מלאי במערכת (POS)']);
  assert.deepEqual(Object.keys(m).sort(), ['chain', 'date', 'inv', 'product', 'qty', 'sku', 'store'].sort());
  assert.equal(m.inv, 'יתרת מלאי במערכת (POS)');
});

test('task list groups by region', () => {
  const { text, count, groups } = buildTaskList(res.cells, { groupBy: 'region', types: ['phantom'], format: 'whatsapp', asOf: res.asOf });
  assert.equal(count, 7);
  assert.ok(groups >= 3);
  assert.match(text, /מלאי רפאים/);
});
