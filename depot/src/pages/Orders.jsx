import { useMemo, useState } from 'react';
import { ClipboardList, Plus, Truck, Printer, Ban, PackageCheck, Trash2, CircleAlert, CheckCircle2, Hand } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Badge, SearchBox, Table, Drawer, Modal, Field, Select, Input, ProductPicker, Empty } from '../components/ui.jsx';
import { ORDER_STATUS, fmt, fmtMoney, fmtDate, fmtDateTime, orderAvailability, fefoAllocate, lotBalances, todayISO } from '../lib/inventory.js';
import { createOrder, setOrderStatus, shipOrder } from '../lib/ops.js';
import { printDoc } from '../lib/print.js';

const TABS = [['open', 'פתוחות'], ['draft', 'טיוטות'], ['shipped', 'נשלחו'], ['all', 'הכול']];

export default function Orders() {
  const { db, idx } = useData();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const totals = new Map();
    for (const l of db.order_lines) {
      const t = totals.get(l.order_id) || { lines: 0, units: 0, value: 0 };
      t.lines++; t.units += Number(l.qty); t.value += Number(l.qty) * Number(l.price || 0);
      totals.set(l.order_id, t);
    }
    return db.orders
      .filter((o) => (tab === 'all' || (tab === 'open' ? ORDER_STATUS[o.status]?.reserves : o.status === tab)))
      .filter((o) => !s || `${o.number} ${idx.customer.get(o.customer_id)?.name || ''}`.toLowerCase().includes(s))
      .map((o) => ({ o, c: idx.customer.get(o.customer_id), t: totals.get(o.id) || { lines: 0, units: 0, value: 0 } }))
      .sort((a, b) => (tab === 'shipped' || tab === 'all' ? b.o.created_at.localeCompare(a.o.created_at) : a.o.due_date.localeCompare(b.o.due_date)));
  }, [db, idx, tab, q]);

  const selected = sel ? db.orders.find((o) => o.id === sel) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="הזמנות לקוחות" sub="הזמנה מאושרת שומרת מלאי · משלוח מוריד מלאי לפי FEFO (התפוגה הקרובה יוצאת ראשונה)">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> הזמנה חדשה</button>
      </PageHeader>
      <Panel bodyClass="p-0" icon={ClipboardList} tone="text-surge"
        title={<div className="flex overflow-hidden rounded-lg border border-coal-700 text-xs normal-case tracking-normal">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-1 ${tab === k ? 'bg-phantom/15 text-phantom-soft' : 'text-slate-400 hover:text-white'}`}>{l}</button>)}
        </div>}
        actions={<SearchBox value={q} onChange={setQ} placeholder="מס׳ הזמנה / לקוח" />}>
        <Table className="max-h-[calc(100vh-230px)]" head={['מס׳', 'לקוח', 'אזור', 'נוצרה', 'לאספקה', { label: 'שורות', end: 1 }, { label: 'יח׳', end: 1 }, { label: 'סכום', end: 1 }, 'סטטוס']}>
          {rows.slice(0, 300).map(({ o, c, t }) => (
            <tr key={o.id} onClick={() => setSel(o.id)} className="cursor-pointer hover:bg-white/[0.03]">
              <td className="num px-3 py-2 text-slate-300">{o.number}</td>
              <td className="px-3 py-2 text-slate-100">{c?.name || '—'}</td>
              <td className="px-3 py-2 text-xs text-slate-400">{c?.region}</td>
              <td className="num px-3 py-2 text-xs text-slate-500">{fmtDateTime(o.created_at)}</td>
              <td className={`num px-3 py-2 text-xs ${ORDER_STATUS[o.status].reserves && o.due_date <= todayISO() ? 'text-phantom' : 'text-slate-400'}`}>{fmtDate(o.due_date)}</td>
              <td className="num px-3 py-2 text-end text-slate-400">{t.lines}</td>
              <td className="num px-3 py-2 text-end">{fmt(t.units)}</td>
              <td className="num px-3 py-2 text-end text-slate-300">{fmtMoney(t.value)}</td>
              <td className="px-3 py-2"><Badge color={ORDER_STATUS[o.status].color}>{ORDER_STATUS[o.status].label}</Badge></td>
            </tr>
          ))}
        </Table>
        {!rows.length && <Empty>אין הזמנות</Empty>}
      </Panel>
      <Drawer open={!!selected} onClose={() => setSel(null)} accent={selected ? ORDER_STATUS[selected.status].color : undefined}>
        {selected && <OrderDetail order={selected} onClose={() => setSel(null)} />}
      </Drawer>
      <NewOrder open={creating} onClose={() => setCreating(false)} onCreated={(o) => { setCreating(false); setSel(o.id); }} />
    </div>
  );
}

function OrderDetail({ order }) {
  const { db, idx, run, busy } = useData();
  const c = idx.customer.get(order.customer_id);
  const lines = db.order_lines.filter((l) => l.order_id === order.id);
  const isOpen = ORDER_STATUS[order.status].reserves || order.status === 'draft';
  const avail = isOpen ? orderAvailability(order, lines, db) : lines.map((l) => ({ ...l, ok: true }));
  const allOk = avail.every((a) => a.ok);
  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.price || 0), 0);

  // Pick plan (FEFO) for open orders; actual shipped lots for shipped ones.
  const plan = useMemo(() => {
    if (order.status === 'shipped') {
      return lines.map((l) => ({ line: l, picks: db.movements.filter((m) => m.ref_id === order.id && m.product_id === l.product_id).map((m) => ({ lot_no: idx.lot.get(m.lot_id)?.lot_no, expiry: idx.lot.get(m.lot_id)?.expiry, qty: -m.qty })) }));
    }
    const bal = lotBalances(db.movements);
    return lines.map((l) => ({ line: l, ...fefoAllocate(l.product_id, Number(l.qty), db.lots, bal) }));
  }, [order, lines, db, idx]);

  const printPick = () => printDoc(`רשימת ליקוט ${order.number}`, [
    `<h1>רשימת ליקוט · ${order.number}</h1><p>${c?.name || ''} · ${c?.city || ''} · לאספקה ${fmtDate(order.due_date)}</p>`,
    `<table><thead><tr><th>✓</th><th>מק״ט</th><th>מוצר</th><th>אצווה</th><th>תפוגה</th><th>כמות</th></tr></thead><tbody>${
      plan.flatMap(({ line, picks }) => picks.map((p) => `<tr><td>☐</td><td>${idx.product.get(line.product_id)?.sku}</td><td>${idx.product.get(line.product_id)?.name}</td><td>${p.lot_no}</td><td>${fmtDate(p.expiry)}</td><td><b>${p.qty}</b></td></tr>`)).join('')}</tbody></table>`,
    '<p class="sig">לוקט ע״י: __________ &nbsp; נבדק ע״י: __________</p>',
  ]);
  const printDelivery = () => printDoc(`תעודת משלוח ${order.number}`, [
    `<h1>תעודת משלוח · ${order.number}</h1><p><b>לכבוד:</b> ${c?.name || ''} (${c?.code || ''}) · ${c?.address || c?.city || ''} · ${c?.phone || ''}</p><p>תאריך: ${fmtDate(todayISO())}</p>`,
    `<table><thead><tr><th>מק״ט</th><th>מוצר</th><th>יחידה</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr></thead><tbody>${
      lines.map((l) => { const p = idx.product.get(l.product_id); return `<tr><td>${p?.sku}</td><td>${p?.name}</td><td>${p?.unit}</td><td>${l.qty}</td><td>${fmt(l.price, 2)}</td><td>${fmt(l.qty * l.price, 2)}</td></tr>`; }).join('')
    }</tbody><tfoot><tr><td colspan="5">סה״כ לפני מע״מ</td><td><b>₪${fmt(total, 2)}</b></td></tr></tfoot></table>`,
    '<p class="sig">שם המקבל: __________ &nbsp; חתימה: __________</p>',
  ]);

  return (
    <>
      <header className="border-b border-coal-700 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Badge color={ORDER_STATUS[order.status].color}>{ORDER_STATUS[order.status].label}</Badge>
          <span className="num text-xs text-slate-500">{order.number}</span>
        </div>
        <h3 className="text-lg font-semibold text-white">{c?.name}</h3>
        <div className="text-xs text-slate-400">{c?.chain} · {c?.city} · {c?.phone} · לאספקה <span className="num">{fmtDate(order.due_date)}</span></div>
        {order.note && <p className="mt-2 rounded-lg bg-white/5 p-2 text-xs text-slate-300">{order.note}</p>}
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {isOpen && (
          <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${allOk ? 'border-healthy/40 bg-healthy/10 text-healthy-soft' : 'border-critical/50 bg-critical/10 text-critical-soft'}`}>
            {allOk ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            {allOk ? 'כל השורות זמינות במלאי – ניתן לשלוח' : 'חלק מהשורות חסרות במלאי – יש לקלוט סחורה או לעדכן כמויות'}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-coal-700">
          <Table head={['מוצר', { label: 'כמות', end: 1 }, { label: 'מחיר', end: 1 }, ...(isOpen ? [{ label: 'פנוי', end: 1 }] : []), 'ליקוט (אצווה · תפוגה)']}>
            {plan.map(({ line, picks }, i) => {
              const a = avail[i];
              return (
                <tr key={line.id}>
                  <td className="px-3 py-2"><div className="text-slate-100">{idx.product.get(line.product_id)?.name}</div><div className="num text-[10px] text-slate-500">{idx.product.get(line.product_id)?.sku}</div></td>
                  <td className="num px-3 py-2 text-end font-semibold">{fmt(line.qty)}</td>
                  <td className="num px-3 py-2 text-end text-slate-400">{fmt(line.price, 2)}</td>
                  {isOpen && <td className={`num px-3 py-2 text-end ${a.ok ? 'text-healthy' : 'text-critical-soft'}`}>{fmt(Math.max(0, a.free))}</td>}
                  <td className="px-3 py-2 text-[11px] text-slate-400">
                    {picks.map((p, j) => <div key={j} className="num">{p.lot_no} · {fmtDate(p.expiry)} · <b className="text-slate-200">{p.qty}</b></div>)}
                  </td>
                </tr>
              );
            })}
          </Table>
          <div className="flex justify-between border-t border-coal-700 px-3 py-2 text-sm"><span className="text-slate-400">סה״כ</span><span className="num font-semibold">{fmtMoney(total)}</span></div>
        </div>
        {order.shipped_at && <div className="text-xs text-slate-500">נשלחה ב-<span className="num">{fmtDateTime(order.shipped_at)}</span></div>}
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-coal-700 p-4">
        {order.status === 'draft' && <button className="btn btn-amber" disabled={busy} onClick={() => run((d, be) => setOrderStatus(d, be, order, 'confirmed'), 'ההזמנה אושרה – המלאי נשמר')}><CheckCircle2 size={15} /> אישור הזמנה</button>}
        {order.status === 'confirmed' && <button className="btn btn-amber" disabled={busy} onClick={() => run((d, be) => setOrderStatus(d, be, order, 'picking'), 'הועבר לליקוט')}><Hand size={15} /> העבר לליקוט</button>}
        {isOpen && <button className="btn btn-primary" disabled={busy || !allOk} onClick={() => run((d, be) => shipOrder(d, be, order), 'ההזמנה נשלחה והמלאי עודכן')}><Truck size={15} /> שליחה וגריעה מהמלאי</button>}
        <button className="btn" onClick={printPick}><PackageCheck size={15} /> רשימת ליקוט</button>
        <button className="btn" onClick={printDelivery}><Printer size={15} /> תעודת משלוח</button>
        {isOpen && <button className="btn ms-auto text-critical-soft" disabled={busy} onClick={() => confirm('לבטל את ההזמנה?') && run((d, be) => setOrderStatus(d, be, order, 'cancelled'), 'ההזמנה בוטלה')}><Ban size={15} /> ביטול</button>}
      </footer>
    </>
  );
}

function NewOrder({ open, onClose, onCreated }) {
  const { db, idx, run, busy } = useData();
  const [customer, setCustomer] = useState('');
  const [due, setDue] = useState(todayISO());
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([]);
  const reset = () => { setCustomer(''); setLines([]); setNote(''); setDue(todayISO()); };
  const add = (p) => setLines((ls) => [...ls, { product_id: p.id, qty: Math.max(1, Number(p.reorder_qty ? Math.round(p.reorder_qty / 10) : 1)), price: p.price }]);
  const upd = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0);

  const save = async (status) => {
    const o = await run((d, be) => createOrder(d, be, { customer_id: customer, lines, due_date: due, note, status }), (r) => `הזמנה ${r.number} נוצרה`);
    if (o) { reset(); onCreated(o); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title="הזמנה חדשה" icon={ClipboardList}
      footer={<>
        <span className="me-auto text-sm text-slate-400">סה״כ <span className="num text-lg font-semibold text-white">{fmtMoney(total)}</span></span>
        <button className="btn" disabled={busy} onClick={() => save('draft')}>שמירה כטיוטה</button>
        <button className="btn btn-primary" disabled={busy || !customer || !lines.length} onClick={() => save('confirmed')}>אישור ושמירת מלאי</button>
      </>}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="לקוח *">
          <Select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">בחירת לקוח…</option>
            {[...db.customers].sort((a, b) => a.name.localeCompare(b.name, 'he')).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.city}</option>)}
          </Select>
        </Field>
        <Field label="תאריך אספקה"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="הערה"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <div className="mt-4"><ProductPicker products={db.products} onPick={add} exclude={lines.map((l) => l.product_id)} /></div>
      <div className="mt-3 overflow-hidden rounded-xl border border-coal-700">
        <Table head={['מוצר', { label: 'זמין', end: 1 }, 'כמות', 'מחיר', { label: 'סה״כ', end: 1 }, '']}>
          {lines.map((l, i) => {
            const s = idx.stock.get(l.product_id);
            const short = Number(l.qty) > (s?.available ?? 0);
            return (
              <tr key={l.product_id}>
                <td className="px-3 py-2 text-slate-100">{idx.product.get(l.product_id)?.name}</td>
                <td className={`num px-3 py-2 text-end ${short ? 'text-critical-soft' : 'text-healthy'}`}>{fmt(s?.available)}</td>
                <td className="px-3 py-1.5"><Input type="number" min="1" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} className="num !w-24" /></td>
                <td className="px-3 py-1.5"><Input type="number" step="0.01" value={l.price} onChange={(e) => upd(i, 'price', e.target.value)} className="num !w-24" /></td>
                <td className="num px-3 py-2 text-end">{fmt(Number(l.qty) * Number(l.price), 2)}</td>
                <td className="px-2"><button className="p-1 text-slate-500 hover:text-critical" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="הסרה"><Trash2 size={14} /></button></td>
              </tr>
            );
          })}
        </Table>
        {!lines.length && <Empty>סרקו ברקוד או חפשו מוצר כדי להוסיף שורה</Empty>}
      </div>
    </Modal>
  );
}
