import { useMemo, useState } from 'react';
import { Boxes, Plus, Pencil, Trash2, Download, History, Layers } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Badge, SearchBox, Select, Table, Drawer, Modal, Field, Input, Empty } from '../components/ui.jsx';
import { STOCK_STATUS, MOVE_TYPES, fmt, fmtMoney, fmtDate, fmtDateTime, daysBetween } from '../lib/inventory.js';
import { saveEntity, deleteEntity } from '../lib/ops.js';
import { exportXlsx } from '../lib/excel.js';

const EXP_COLOR = { expired: '#FF3B5C', critical: '#FF3B5C', soon: '#F59E0B', ok: '#10B981', none: '#64748B' };

export default function Inventory() {
  const { summary, db } = useData();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [st, setSt] = useState('');
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);

  const cats = useMemo(() => [...new Set(db.products.map((p) => p.category).filter(Boolean))].sort(), [db.products]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return summary
      .filter((r) => (!s || `${r.product.name} ${r.product.sku} ${r.product.barcode}`.toLowerCase().includes(s)) && (!cat || r.product.category === cat) && (!st || r.status === st))
      .sort((a, b) => ['out', 'over', 'low', 'ok'].indexOf(a.status) - ['out', 'over', 'low', 'ok'].indexOf(b.status) || a.product.name.localeCompare(b.product.name, 'he'));
  }, [summary, q, cat, st]);

  const doExport = () => exportXlsx('מלאי.xlsx', rows.map((r) => ({
    'מק״ט': r.product.sku, 'ברקוד': r.product.barcode, 'שם מוצר': r.product.name, 'קטגוריה': r.product.category, 'יחידה': r.product.unit,
    'במלאי': r.usable, 'פג תוקף': r.expiredQty, 'שמור להזמנות': r.reserved, 'זמין': r.available, 'בדרך מספקים': r.onOrder,
    'מינימום': r.product.min_qty, 'נקודת הזמנה': r.reorderPoint, 'תפוגה קרובה': r.nearestExpiry || '', 'שווי': Math.round(r.value), 'סטטוס': STOCK_STATUS[r.status].label,
  })));

  const selected = sel ? summary.find((s) => s.product.id === sel) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="מלאי" sub="יתרות מחושבות מיומן התנועות · זמין = במלאי בתוקף פחות הזמנות לקוחות פתוחות">
        <button className="btn" onClick={doExport}><Download size={15} /> ייצוא לאקסל</button>
        <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={15} /> מוצר חדש</button>
      </PageHeader>

      <Panel bodyClass="p-0" title={`${rows.length} מוצרים`} icon={Boxes}
        actions={<>
          <SearchBox value={q} onChange={setQ} placeholder="שם / מק״ט / ברקוד" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="!w-36"><option value="">כל הקטגוריות</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select value={st} onChange={(e) => setSt(e.target.value)} className="!w-40"><option value="">כל הסטטוסים</option>{Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        </>}>
        <Table className="max-h-[calc(100vh-230px)]" head={['מק״ט', 'מוצר', 'קטגוריה', { label: 'במלאי', end: 1 }, { label: 'שמור', end: 1 }, { label: 'זמין', end: 1 }, { label: 'בדרך', end: 1 }, { label: 'נק׳ הזמנה', end: 1 }, 'תפוגה קרובה', { label: 'שווי', end: 1 }, 'סטטוס']}>
          {rows.map((r) => {
            const d = r.nearestExpiry ? daysBetween(r.nearestExpiry, new Date().toISOString().slice(0, 10)) : null;
            return (
              <tr key={r.product.id} onClick={() => setSel(r.product.id)} className="cursor-pointer hover:bg-white/[0.03]">
                <td className="num px-3 py-2 text-xs text-slate-400">{r.product.sku}</td>
                <td className="max-w-[260px] truncate px-3 py-2 text-slate-100">{r.product.name}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{r.product.category}</td>
                <td className="num px-3 py-2 text-end">{fmt(r.usable)}{r.expiredQty > 0 && <span className="ms-1 text-[10px] text-critical-soft" title="יחידות שפג תוקפן">(+{fmt(r.expiredQty)} פג)</span>}</td>
                <td className="num px-3 py-2 text-end text-slate-400">{fmt(r.reserved)}</td>
                <td className="num px-3 py-2 text-end font-semibold" style={{ color: STOCK_STATUS[r.status].color }}>{fmt(r.available)}</td>
                <td className="num px-3 py-2 text-end text-surge-soft">{r.onOrder ? fmt(r.onOrder) : '–'}</td>
                <td className="num px-3 py-2 text-end text-slate-500">{fmt(r.reorderPoint)}</td>
                <td className="num px-3 py-2 text-xs" style={{ color: d == null ? '#64748B' : d <= 7 ? '#FF6B81' : d <= 30 ? '#FBBF24' : '#94A3B8' }}>{r.nearestExpiry ? `${fmtDate(r.nearestExpiry)} (${d}י׳)` : '—'}</td>
                <td className="num px-3 py-2 text-end text-slate-300">{fmtMoney(r.value)}</td>
                <td className="px-3 py-2"><Badge color={STOCK_STATUS[r.status].color}>{STOCK_STATUS[r.status].label}</Badge></td>
              </tr>
            );
          })}
        </Table>
        {!rows.length && <Empty>לא נמצאו מוצרים</Empty>}
      </Panel>

      <Drawer open={!!selected} onClose={() => setSel(null)} accent={selected ? STOCK_STATUS[selected.status].color : undefined}>
        {selected && <ProductDetail s={selected} />}
      </Drawer>
      <ProductForm product={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function ProductDetail({ s }) {
  const { db, idx } = useData();
  const p = s.product;
  const moves = useMemo(() => db.movements.filter((m) => m.product_id === p.id).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 25), [db.movements, p.id]);
  const [edit, setEdit] = useState(null);
  return (
    <>
      <header className="flex items-start gap-3 border-b border-coal-700 p-5">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge color={STOCK_STATUS[s.status].color}>{STOCK_STATUS[s.status].label}</Badge>
            <span className="text-xs text-slate-500">{p.category} · {p.unit}</span>
          </div>
          <h3 className="text-lg font-semibold text-white">{p.name}</h3>
          <div className="num text-xs text-slate-500">{p.sku} · {p.barcode}</div>
        </div>
        <button className="btn text-xs" onClick={() => setEdit(p)}><Pencil size={14} /> עריכה</button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="grid grid-cols-3 gap-2">
          {[['במלאי (בתוקף)', s.usable], ['שמור להזמנות', s.reserved], ['זמין למכירה', s.available], ['בדרך מספקים', s.onOrder], ['נקודת הזמנה', s.reorderPoint], ['צריכה יומית (30י׳)', fmt(s.avgDaily, 1)],
            ['ימי כיסוי', s.daysCover === Infinity ? '∞' : fmt(s.daysCover, 1)], ['עלות / מחיר', `${fmt(p.cost, 2)} / ${fmt(p.price, 2)}`], ['ספק', s.supplier?.name || '—']].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-coal-700 bg-coal-850/70 px-3 py-2">
              <div className="text-[10px] text-slate-500">{l}</div>
              <div className="num truncate text-end text-base font-semibold text-slate-100">{typeof v === 'number' ? fmt(v) : v}</div>
            </div>
          ))}
        </div>

        <section>
          <h4 className="panel-title mb-2"><Layers size={14} className="text-phantom" /> אצוות במלאי</h4>
          <div className="overflow-hidden rounded-xl border border-coal-700">
            <Table head={['אצווה', 'תפוגה', { label: 'כמות', end: 1 }, 'נקלט']}>
              {s.lots.map((l) => (
                <tr key={l.id}>
                  <td className="num px-3 py-1.5 text-xs text-slate-300">{l.lot_no}</td>
                  <td className="px-3 py-1.5"><span className="num text-xs" style={{ color: EXP_COLOR[l.state] }}>{l.expiry ? fmtDate(l.expiry) : 'ללא'}</span>{l.state === 'expired' && <Badge color="#FF3B5C" className="ms-2">פג</Badge>}</td>
                  <td className="num px-3 py-1.5 text-end">{fmt(l.qty)}</td>
                  <td className="num px-3 py-1.5 text-xs text-slate-500">{fmtDate(l.received_at?.slice(0, 10))}</td>
                </tr>
              ))}
            </Table>
            {!s.lots.length && <Empty>אין מלאי</Empty>}
          </div>
        </section>

        <section>
          <h4 className="panel-title mb-2"><History size={14} className="text-surge" /> תנועות אחרונות</h4>
          <div className="overflow-hidden rounded-xl border border-coal-700">
            <Table head={['מועד', 'סוג', { label: 'כמות', end: 1 }, 'אסמכתא']}>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="num px-3 py-1.5 text-xs text-slate-400">{fmtDateTime(m.ts)}</td>
                  <td className="px-3 py-1.5 text-xs" style={{ color: MOVE_TYPES[m.type]?.color }}>{MOVE_TYPES[m.type]?.label || m.type}</td>
                  <td className={`num px-3 py-1.5 text-end ${m.qty > 0 ? 'text-healthy' : 'text-critical-soft'}`}>{m.qty > 0 ? '+' : ''}{fmt(m.qty)}</td>
                  <td className="truncate px-3 py-1.5 text-xs text-slate-500">{m.ref_type === 'order' ? `${m.note} · ${idx.customer.get(db.orders.find((o) => o.id === m.ref_id)?.customer_id)?.name || ''}` : m.note}</td>
                </tr>
              ))}
            </Table>
          </div>
        </section>
      </div>
      <ProductForm product={edit} onClose={() => setEdit(null)} />
    </>
  );
}

export function ProductForm({ product, onClose }) {
  const { db, run } = useData();
  const [f, setF] = useState(null);
  const open = !!product;
  if (open && (!f || f._for !== (product.id || 'new'))) {
    setF({ _for: product.id || 'new', name: '', sku: '', barcode: '', category: '', unit: 'יח׳', cost: '', price: '', min_qty: 0, reorder_qty: 0, supplier_id: db.suppliers[0]?.id || '', track_expiry: true, active: true, ...product });
  }
  if (!open || !f) return null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    if (!f.name || !f.sku) return;
    if (db.products.some((p) => p.sku === f.sku && p.id !== f.id)) { alert('מק״ט כבר קיים'); return; }
    const { _for, ...row } = f;
    const num = ['cost', 'price', 'min_qty', 'reorder_qty'];
    for (const k of num) row[k] = Number(row[k] || 0);
    const ok = await run((d, be) => saveEntity(be, 'products', row), 'המוצר נשמר');
    if (ok) { setF(null); onClose(); }
  };
  const del = async () => {
    if (!confirm('למחוק את המוצר?')) return;
    const ok = await run((d, be) => deleteEntity(d, be, 'products', f.id).then(() => true), 'המוצר נמחק');
    if (ok) { setF(null); onClose(); }
  };
  return (
    <Modal open onClose={() => { setF(null); onClose(); }} title={f.id ? 'עריכת מוצר' : 'מוצר חדש'} icon={Boxes}
      footer={<>
        {f.id && <button className="btn me-auto text-critical-soft" onClick={del}><Trash2 size={14} /> מחיקה</button>}
        <button className="btn" onClick={() => { setF(null); onClose(); }}>ביטול</button>
        <button className="btn btn-primary" onClick={save} disabled={!f.name || !f.sku}>שמירה</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שם מוצר *" className="col-span-2"><Input value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="מק״ט *"><Input value={f.sku} onChange={set('sku')} className="num" /></Field>
        <Field label="ברקוד"><Input value={f.barcode} onChange={set('barcode')} className="num" /></Field>
        <Field label="קטגוריה"><Input value={f.category} onChange={set('category')} list="cats" /></Field>
        <Field label="יחידת מידה"><Input value={f.unit} onChange={set('unit')} /></Field>
        <Field label="מחיר עלות (₪)"><Input type="number" step="0.01" value={f.cost} onChange={set('cost')} /></Field>
        <Field label="מחיר מכירה (₪)"><Input type="number" step="0.01" value={f.price} onChange={set('price')} /></Field>
        <Field label="מלאי מינימום" hint="מתחת לכך – התראה והצעת רכש"><Input type="number" value={f.min_qty} onChange={set('min_qty')} /></Field>
        <Field label="כמות הזמנה רגילה"><Input type="number" value={f.reorder_qty} onChange={set('reorder_qty')} /></Field>
        <Field label="ספק" className="col-span-2">
          <Select value={f.supplier_id || ''} onChange={set('supplier_id')}><option value="">—</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" className="accent-amber-500" checked={!!f.track_expiry} onChange={set('track_expiry')} /> מעקב תוקף ואצוות (חובה להזין תפוגה בקליטה)
        </label>
      </div>
      <datalist id="cats">{[...new Set(db.products.map((p) => p.category))].map((c) => <option key={c} value={c} />)}</datalist>
    </Modal>
  );
}
