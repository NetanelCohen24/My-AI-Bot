import { useMemo, useState } from 'react';
import { ClipboardCheck, Trash2, Undo2 } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, ProductPicker, Table, Input, Empty, Field, Select } from '../components/ui.jsx';
import { fmt, fmtDate } from '../lib/inventory.js';
import { recordCount, receiveGoods } from '../lib/ops.js';

export default function Count() {
  const { db, idx, run, busy } = useData();
  const [rows, setRows] = useState([]); // {product_id, lot_id, lot_no, expiry, system, counted}
  const [note, setNote] = useState('ספירת מלאי');
  const [ret, setRet] = useState({ customer: '', lines: [] });

  const addProduct = (p) => {
    const s = idx.stock.get(p.id);
    const lots = s?.lots?.length ? s.lots : [];
    setRows((r) => [...r,
      ...(lots.length ? lots.map((l) => ({ product_id: p.id, lot_id: l.id, lot_no: l.lot_no, expiry: l.expiry, system: l.qty, counted: '' }))
        : [{ product_id: p.id, lot_id: null, lot_no: '', expiry: '', system: 0, counted: '' }])]);
  };
  const upd = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const diffs = useMemo(() => rows.filter((r) => r.counted !== '' && Number(r.counted) !== r.system), [rows]);

  const submit = async () => {
    const n = await run((d, be) => recordCount(d, be, rows, note), (k) => (k ? `נרשמו ${k} התאמות מלאי` : 'אין הפרשים – המלאי תואם'));
    if (n !== undefined) setRows([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ספירת מלאי והחזרות" sub="הזינו כמות שנספרה בפועל – המערכת רושמת תנועת התאמה בגובה ההפרש" />
      <Panel title="ספירה" icon={ClipboardCheck} bodyClass="p-0"
        actions={<Input value={note} onChange={(e) => setNote(e.target.value)} className="!w-56" placeholder="תיאור הספירה" />}>
        <div className="border-b border-coal-700 p-3"><ProductPicker products={db.products} onPick={addProduct} exclude={[...new Set(rows.map((r) => r.product_id))]} placeholder="סרקו / בחרו מוצר לספירה…" /></div>
        <Table head={['מוצר', 'אצווה', 'תפוגה', { label: 'במערכת', end: 1 }, 'נספר', { label: 'הפרש', end: 1 }, '']}>
          {rows.map((r, i) => {
            const d = r.counted === '' ? null : Number(r.counted) - r.system;
            return (
              <tr key={i}>
                <td className="px-3 py-2 text-slate-100">{idx.product.get(r.product_id)?.name}</td>
                <td className="px-3 py-1.5">{r.lot_id ? <span className="num text-xs text-slate-300">{r.lot_no}</span> : <Input value={r.lot_no} onChange={(e) => upd(i, 'lot_no', e.target.value)} placeholder="מס׳ אצווה" className="num !w-32" />}</td>
                <td className="px-3 py-1.5">{r.lot_id ? <span className="num text-xs text-slate-400">{fmtDate(r.expiry)}</span> : <Input type="date" value={r.expiry} onChange={(e) => upd(i, 'expiry', e.target.value)} className="num !w-40" />}</td>
                <td className="num px-3 py-2 text-end text-slate-400">{fmt(r.system)}</td>
                <td className="px-3 py-1.5"><Input type="number" min="0" value={r.counted} onChange={(e) => upd(i, 'counted', e.target.value)} className="num !w-24" /></td>
                <td className={`num px-3 py-2 text-end font-semibold ${d == null || d === 0 ? 'text-slate-500' : d > 0 ? 'text-healthy' : 'text-critical-soft'}`}>{d == null ? '—' : `${d > 0 ? '+' : ''}${d}`}</td>
                <td className="px-2"><button className="p-1 text-slate-500 hover:text-critical" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="הסרה"><Trash2 size={14} /></button></td>
              </tr>
            );
          })}
        </Table>
        {!rows.length && <Empty>בחרו מוצרים לספירה – כל אצווה תופיע בשורה נפרדת</Empty>}
        <div className="flex items-center justify-between border-t border-coal-700 p-3">
          <span className="text-sm text-slate-400"><span className="num text-white">{diffs.length}</span> שורות עם הפרש</span>
          <button className="btn btn-primary" disabled={busy || !rows.some((r) => r.counted !== '')} onClick={submit}><ClipboardCheck size={15} /> אישור ספירה</button>
        </div>
      </Panel>

      <Panel title="החזרה מלקוח" icon={Undo2} tone="text-void" bodyClass="p-0">
        <div className="grid gap-3 border-b border-coal-700 p-3 md:grid-cols-2">
          <Field label="לקוח"><Select value={ret.customer} onChange={(e) => setRet({ ...ret, customer: e.target.value })}><option value="">בחירה…</option>{db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="מוצר"><ProductPicker products={db.products} exclude={ret.lines.map((l) => l.product_id)} onPick={(p) => setRet((r) => ({ ...r, lines: [...r.lines, { product_id: p.id, qty: 1, lot_no: idx.stock.get(p.id)?.lots?.[0]?.lot_no || '', expiry: idx.stock.get(p.id)?.lots?.[0]?.expiry || '' }] }))} /></Field>
        </div>
        <Table head={['מוצר', 'כמות', 'אצווה', '']}>
          {ret.lines.map((l, i) => (
            <tr key={l.product_id}>
              <td className="px-3 py-2 text-slate-100">{idx.product.get(l.product_id)?.name}</td>
              <td className="px-3 py-1.5"><Input type="number" min="1" value={l.qty} onChange={(e) => setRet((r) => ({ ...r, lines: r.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) }))} className="num !w-24" /></td>
              <td className="px-3 py-1.5"><Input value={l.lot_no} onChange={(e) => setRet((r) => ({ ...r, lines: r.lines.map((x, j) => (j === i ? { ...x, lot_no: e.target.value } : x)) }))} className="num !w-36" /></td>
              <td className="px-2"><button className="p-1 text-slate-500 hover:text-critical" onClick={() => setRet((r) => ({ ...r, lines: r.lines.filter((_, j) => j !== i) }))} aria-label="הסרה"><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </Table>
        <div className="flex justify-end border-t border-coal-700 p-3">
          <button className="btn btn-amber" disabled={busy || !ret.customer || !ret.lines.length}
            onClick={() => run((d, be) => receiveGoods(d, be, { lines: ret.lines, note: `החזרה מ-${idx.customer.get(ret.customer)?.name}`, type: 'return' }), 'ההחזרה נקלטה').then((n) => n && setRet({ customer: '', lines: [] }))}>
            <Undo2 size={15} /> קליטת החזרה
          </button>
        </div>
      </Panel>
    </div>
  );
}
