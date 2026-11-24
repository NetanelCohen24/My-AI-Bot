import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Trash2, FileInput } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Field, Select, Input, ProductPicker, Table, Empty, Badge } from '../components/ui.jsx';
import { PO_STATUS, fmt, fmtDate, todayISO } from '../lib/inventory.js';
import { receiveGoods } from '../lib/ops.js';

const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export default function Receiving({ initialPo, clearInitial }) {
  const { db, idx, run, busy } = useData();
  const [supplier, setSupplier] = useState('');
  const [poId, setPoId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([]);

  const openPOs = useMemo(() => db.purchase_orders.filter((p) => PO_STATUS[p.status]?.open), [db.purchase_orders]);

  const loadPo = (id) => {
    setPoId(id);
    const po = db.purchase_orders.find((p) => p.id === id);
    if (!po) { setLines([]); return; }
    setSupplier(po.supplier_id);
    setLines(db.po_lines.filter((l) => l.po_id === id).map((l) => {
      const p = idx.product.get(l.product_id);
      return { product_id: l.product_id, qty: Number(l.qty) - Number(l.received_qty || 0), lot_no: '', expiry: p?.track_expiry ? addDays(p.shelf_days || 30) : '' };
    }));
  };
  useEffect(() => { if (initialPo) { loadPo(initialPo); clearInitial?.(); } }, [initialPo]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (p) => setLines((ls) => [...ls, { product_id: p.id, qty: p.reorder_qty || 1, lot_no: '', expiry: p.track_expiry ? addDays(p.shelf_days || 30) : '' }]);
  const upd = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const submit = async () => {
    const n = await run((d, be) => receiveGoods(d, be, { supplier_id: supplier || null, po_id: poId || null, lines, note }), (k) => `נקלטו ${k} שורות למלאי`);
    if (n) { setLines([]); setPoId(''); setNote(''); }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="קליטת סחורה" sub="קליטה מספק – עם או בלי הזמנת רכש. כל שורה יוצרת אצווה עם תאריך תפוגה." />
      <Panel title="פרטי קליטה" icon={FileInput} tone="text-healthy">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="מהזמנת רכש פתוחה">
            <Select value={poId} onChange={(e) => loadPo(e.target.value)}>
              <option value="">ללא – קליטה חופשית</option>
              {openPOs.map((p) => <option key={p.id} value={p.id}>{p.number} · {idx.supplier.get(p.supplier_id)?.name}</option>)}
            </Select>
          </Field>
          <Field label="ספק">
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} disabled={!!poId}>
              <option value="">—</option>
              {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="תעודת משלוח / הערה" className="md:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: ת.מ 45821" /></Field>
        </div>
      </Panel>

      <Panel title="שורות קליטה" icon={PackagePlus} tone="text-healthy" bodyClass="p-0"
        actions={poId && <Badge color="#38BDF8">מתוך {db.purchase_orders.find((p) => p.id === poId)?.number}</Badge>}>
        <div className="border-b border-coal-700 p-3"><ProductPicker products={db.products} onPick={add} autoFocus exclude={lines.map((l) => l.product_id)} /></div>
        <Table head={['מוצר', 'כמות', 'מס׳ אצווה', 'תאריך תפוגה', '']}>
          {lines.map((l, i) => {
            const p = idx.product.get(l.product_id);
            return (
              <tr key={l.product_id}>
                <td className="px-3 py-2"><div className="text-slate-100">{p?.name}</div><div className="num text-[10px] text-slate-500">{p?.sku} · {p?.unit}</div></td>
                <td className="px-3 py-1.5"><Input type="number" min="1" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} className="num !w-24" /></td>
                <td className="px-3 py-1.5"><Input value={l.lot_no} onChange={(e) => upd(i, 'lot_no', e.target.value)} placeholder="אוטומטי" className="num !w-36" /></td>
                <td className="px-3 py-1.5">
                  {p?.track_expiry
                    ? <Input type="date" value={l.expiry} min={todayISO()} onChange={(e) => upd(i, 'expiry', e.target.value)} className="num !w-40" />
                    : <span className="text-xs text-slate-500">ללא מעקב תוקף</span>}
                </td>
                <td className="px-2"><button className="p-1 text-slate-500 hover:text-critical" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="הסרה"><Trash2 size={14} /></button></td>
              </tr>
            );
          })}
        </Table>
        {!lines.length && <Empty>סרקו ברקוד, חפשו מוצר או בחרו הזמנת רכש</Empty>}
        <div className="flex items-center justify-between border-t border-coal-700 p-3">
          <span className="text-sm text-slate-400"><span className="num text-white">{lines.length}</span> שורות · <span className="num text-white">{fmt(lines.reduce((s, l) => s + Number(l.qty || 0), 0))}</span> יח׳</span>
          <button className="btn btn-primary" disabled={busy || !lines.length} onClick={submit}><PackagePlus size={15} /> קליטה למלאי</button>
        </div>
      </Panel>
      <p className="text-[11px] text-slate-500">טיפ: סורק ברקודים USB/Bluetooth עובד כמו מקלדת – סרקו לתוך שדה החיפוש והשורה תתווסף אוטומטית. תפוגה ברירת מחדל: <span className="num">{fmtDate(addDays(30))}</span> או לפי חיי המדף של המוצר.</p>
    </div>
  );
}
