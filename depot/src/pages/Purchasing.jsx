import { useMemo, useState } from 'react';
import { ShoppingCart, Sparkles, Send, PackagePlus, Copy, Ban, Trash2, Plus, Mail } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Badge, Table, Modal, Field, Select, Input, ProductPicker, Empty, copyText, useToast } from '../components/ui.jsx';
import { PO_STATUS, STOCK_STATUS, fmt, fmtMoney, fmtDate, fmtDateTime } from '../lib/inventory.js';
import { createPO } from '../lib/ops.js';

function poText(po, lines, sup, idx) {
  return [
    `שלום ${sup?.name || ''},`,
    `הזמנת רכש ${po.number} מתאריך ${fmtDate(po.created_at.slice(0, 10))}:`,
    '',
    ...lines.map((l) => { const p = idx.product.get(l.product_id); return `• ${p?.name} (${p?.sku}) – ${l.qty} ${p?.unit || ''}`; }),
    '',
    po.note ? `הערה: ${po.note}` : null,
    'נא לאשר מועד אספקה. תודה!',
  ].filter((x) => x != null).join('\n');
}

export default function Purchasing({ onReceive }) {
  const { db, idx, summary, run, busy } = useData();
  const toast = useToast();
  const [picked, setPicked] = useState(null); // suggestions selection → modal
  const [manual, setManual] = useState(false);
  const [view, setView] = useState(null);

  const suggestions = useMemo(() => summary.filter((s) => s.suggest > 0).sort((a, b) => (a.supplier?.name || '').localeCompare(b.supplier?.name || '', 'he')), [summary]);
  const bySupplier = useMemo(() => {
    const m = new Map();
    for (const s of suggestions) {
      const k = s.product.supplier_id || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
    return [...m.entries()];
  }, [suggestions]);

  const pos = useMemo(() => [...db.purchase_orders].sort((a, b) => b.created_at.localeCompare(a.created_at)), [db.purchase_orders]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="רכש" sub="הצעות הזמנה מחושבות לפי צריכה ב-30 הימים האחרונים, זמן אספקת הספק ומלאי מינימום">
        <button className="btn" onClick={() => setManual(true)}><Plus size={15} /> הזמנת רכש ידנית</button>
      </PageHeader>

      <Panel title="הצעות הזמנה" icon={Sparkles} bodyClass="p-0" actions={<Badge color="#F59E0B">{suggestions.length} מוצרים</Badge>}>
        {!suggestions.length && <Empty>אין צורך בהזמנה כרגע 👌</Empty>}
        {bySupplier.map(([supId, list]) => {
          const sup = idx.supplier.get(supId);
          return (
            <div key={supId} className="border-b border-coal-700 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white/[0.02] px-4 py-2">
                <div className="text-sm"><span className="font-semibold text-slate-100">{sup?.name || 'ללא ספק'}</span> <span className="text-xs text-slate-500">· זמן אספקה {sup?.lead_days ?? '?'} ימים</span></div>
                <button className="btn btn-amber text-xs" disabled={!sup} onClick={() => setPicked({ supplier_id: supId, lines: list.map((s) => ({ product_id: s.product.id, qty: s.suggest, cost: s.product.cost })) })}>
                  <ShoppingCart size={14} /> צור הזמנה ({list.length})
                </button>
              </div>
              <Table head={['מוצר', 'סטטוס', { label: 'זמין', end: 1 }, { label: 'בדרך', end: 1 }, { label: 'צריכה/יום', end: 1 }, { label: 'נק׳ הזמנה', end: 1 }, { label: 'מוצע', end: 1 }, { label: 'עלות', end: 1 }]}>
                {list.map((s) => (
                  <tr key={s.product.id}>
                    <td className="px-3 py-2 text-slate-100">{s.product.name}</td>
                    <td className="px-3 py-2"><Badge color={STOCK_STATUS[s.status].color}>{STOCK_STATUS[s.status].label}</Badge></td>
                    <td className="num px-3 py-2 text-end" style={{ color: STOCK_STATUS[s.status].color }}>{fmt(s.available)}</td>
                    <td className="num px-3 py-2 text-end text-slate-400">{fmt(s.onOrder)}</td>
                    <td className="num px-3 py-2 text-end text-slate-400">{fmt(s.avgDaily, 1)}</td>
                    <td className="num px-3 py-2 text-end text-slate-400">{fmt(s.reorderPoint)}</td>
                    <td className="num px-3 py-2 text-end font-semibold text-phantom-soft">{fmt(s.suggest)}</td>
                    <td className="num px-3 py-2 text-end text-slate-300">{fmtMoney(s.suggest * s.product.cost)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          );
        })}
      </Panel>

      <Panel title="הזמנות רכש" icon={ShoppingCart} tone="text-surge" bodyClass="p-0">
        <Table className="max-h-[420px]" head={['מס׳', 'ספק', 'נוצרה', { label: 'שורות', end: 1 }, { label: 'עלות', end: 1 }, 'סטטוס', '']}>
          {pos.slice(0, 150).map((po) => {
            const lines = db.po_lines.filter((l) => l.po_id === po.id);
            return (
              <tr key={po.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setView(po.id)}>
                <td className="num px-3 py-2 text-slate-300">{po.number}</td>
                <td className="px-3 py-2 text-slate-100">{idx.supplier.get(po.supplier_id)?.name}</td>
                <td className="num px-3 py-2 text-xs text-slate-500">{fmtDateTime(po.created_at)}</td>
                <td className="num px-3 py-2 text-end">{lines.length}</td>
                <td className="num px-3 py-2 text-end text-slate-300">{fmtMoney(lines.reduce((s, l) => s + l.qty * (l.cost || 0), 0))}</td>
                <td className="px-3 py-2"><Badge color={PO_STATUS[po.status].color}>{PO_STATUS[po.status].label}</Badge></td>
                <td className="px-3 py-2 text-end">
                  {PO_STATUS[po.status].open && <button className="btn text-xs" onClick={(e) => { e.stopPropagation(); onReceive(po.id); }}><PackagePlus size={13} /> קליטה</button>}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <POEditor draft={picked || (manual ? { supplier_id: '', lines: [] } : null)} onClose={() => { setPicked(null); setManual(false); }}
        onSaved={(po) => { setPicked(null); setManual(false); setView(po.id); }} />

      {view && (() => {
        const po = db.purchase_orders.find((p) => p.id === view);
        if (!po) return null;
        const lines = db.po_lines.filter((l) => l.po_id === po.id);
        const sup = idx.supplier.get(po.supplier_id);
        const text = poText(po, lines, sup, idx);
        return (
          <Modal open onClose={() => setView(null)} title={`הזמנת רכש ${po.number}`} icon={ShoppingCart}
            footer={<>
              {PO_STATUS[po.status].open && <button className="btn me-auto text-critical-soft" disabled={busy} onClick={() => confirm('לבטל את הזמנת הרכש?') && run((d, be) => be.update('purchase_orders', po.id, { status: 'cancelled' }), 'בוטלה').then(() => setView(null))}><Ban size={14} /> ביטול</button>}
              <button className="btn" onClick={() => copyText(text).then(() => toast('ok', 'הועתק ללוח'))}><Copy size={14} /> העתקה</button>
              <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${(sup?.phone || '').replace(/\D/g, '').replace(/^0/, '972')}?text=${encodeURIComponent(text)}`}><Send size={14} className="text-healthy" /> וואטסאפ</a>
              <a className="btn" href={`mailto:${sup?.email || ''}?subject=${encodeURIComponent(`הזמנת רכש ${po.number}`)}&body=${encodeURIComponent(text)}`}><Mail size={14} className="text-surge" /> מייל</a>
              {PO_STATUS[po.status].open && <button className="btn btn-primary" onClick={() => { setView(null); onReceive(po.id); }}><PackagePlus size={14} /> קליטה</button>}
            </>}>
            <div className="mb-3 flex items-center gap-2"><Badge color={PO_STATUS[po.status].color}>{PO_STATUS[po.status].label}</Badge><span className="text-sm text-slate-300">{sup?.name}</span></div>
            <pre className="whitespace-pre-wrap rounded-xl border border-coal-700 bg-coal-900/70 p-4 font-sans text-[13px] leading-relaxed text-slate-200">{text}</pre>
            {lines.some((l) => l.received_qty) && <p className="mt-2 text-xs text-slate-400">התקבל: {lines.map((l) => `${idx.product.get(l.product_id)?.name} ${l.received_qty}/${l.qty}`).join(' · ')}</p>}
          </Modal>
        );
      })()}
    </div>
  );
}

function POEditor({ draft, onClose, onSaved }) {
  const { db, idx, run, busy } = useData();
  const [st, setSt] = useState(null);
  const key = draft ? JSON.stringify(draft) : null;
  if (draft && (!st || st._key !== key)) setSt({ _key: key, supplier_id: draft.supplier_id, note: '', lines: draft.lines });
  if (!draft || !st) return null;
  const upd = (i, k, v) => setSt((s) => ({ ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const total = st.lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.cost || 0), 0);
  const save = async () => {
    const po = await run((d, be) => createPO(d, be, { supplier_id: st.supplier_id, lines: st.lines, note: st.note }), (r) => `הזמנת רכש ${r.number} נוצרה`);
    if (po) { setSt(null); onSaved(po); }
  };
  return (
    <Modal open wide onClose={() => { setSt(null); onClose(); }} title="הזמנת רכש חדשה" icon={ShoppingCart}
      footer={<>
        <span className="me-auto text-sm text-slate-400">סה״כ עלות <span className="num text-lg font-semibold text-white">{fmtMoney(total)}</span></span>
        <button className="btn btn-primary" disabled={busy || !st.supplier_id || !st.lines.length} onClick={save}><Send size={15} /> יצירה וסימון כנשלחה</button>
      </>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="ספק *"><Select value={st.supplier_id} onChange={(e) => setSt((s) => ({ ...s, supplier_id: e.target.value }))}><option value="">בחירה…</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="הערה לספק"><Input value={st.note} onChange={(e) => setSt((s) => ({ ...s, note: e.target.value }))} /></Field>
      </div>
      <div className="mt-3"><ProductPicker products={db.products.filter((p) => !st.supplier_id || p.supplier_id === st.supplier_id)} exclude={st.lines.map((l) => l.product_id)}
        onPick={(p) => setSt((s) => ({ ...s, lines: [...s.lines, { product_id: p.id, qty: p.reorder_qty || 1, cost: p.cost }] }))} /></div>
      <div className="mt-3 overflow-hidden rounded-xl border border-coal-700">
        <Table head={['מוצר', { label: 'זמין', end: 1 }, 'כמות', 'עלות ליח׳', '']}>
          {st.lines.map((l, i) => (
            <tr key={l.product_id}>
              <td className="px-3 py-2 text-slate-100">{idx.product.get(l.product_id)?.name}</td>
              <td className="num px-3 py-2 text-end text-slate-400">{fmt(idx.stock.get(l.product_id)?.available)}</td>
              <td className="px-3 py-1.5"><Input type="number" min="1" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} className="num !w-24" /></td>
              <td className="px-3 py-1.5"><Input type="number" step="0.01" value={l.cost} onChange={(e) => upd(i, 'cost', e.target.value)} className="num !w-24" /></td>
              <td className="px-2"><button className="p-1 text-slate-500 hover:text-critical" onClick={() => setSt((s) => ({ ...s, lines: s.lines.filter((_, j) => j !== i) }))} aria-label="הסרה"><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </Table>
        {!st.lines.length && <Empty>הוסיפו מוצרים</Empty>}
      </div>
    </Modal>
  );
}
