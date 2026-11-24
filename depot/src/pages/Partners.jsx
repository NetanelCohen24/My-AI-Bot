import { useMemo, useState } from 'react';
import { Store, Factory, Plus, Trash2 } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Table, SearchBox, Modal, Field, Input, Empty } from '../components/ui.jsx';
import { fmt, fmtMoney, fmtDate, ORDER_STATUS } from '../lib/inventory.js';
import { saveEntity, deleteEntity } from '../lib/ops.js';

const SPEC = {
  customers: {
    title: 'לקוחות (חנויות)', icon: Store, singular: 'לקוח',
    fields: [['code', 'קוד לקוח'], ['name', 'שם *'], ['chain', 'רשת'], ['city', 'עיר'], ['region', 'אזור'], ['phone', 'טלפון'], ['address', 'כתובת', 2]],
  },
  suppliers: {
    title: 'ספקים', icon: Factory, singular: 'ספק',
    fields: [['name', 'שם *', 2], ['phone', 'טלפון'], ['email', 'אימייל'], ['lead_days', 'ימי אספקה']],
  },
};

export default function Partners({ kind }) {
  const { db } = useData();
  const spec = SPEC[kind];
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);

  const stats = useMemo(() => {
    const m = new Map();
    if (kind === 'customers') {
      const val = new Map();
      for (const l of db.order_lines) val.set(l.order_id, (val.get(l.order_id) || 0) + l.qty * (l.price || 0));
      for (const o of db.orders) {
        const s = m.get(o.customer_id) || { orders: 0, open: 0, value: 0, last: '' };
        if (o.status === 'shipped') { s.orders++; s.value += val.get(o.id) || 0; if (o.created_at > s.last) s.last = o.created_at; }
        if (ORDER_STATUS[o.status]?.reserves) s.open++;
        m.set(o.customer_id, s);
      }
    } else {
      for (const p of db.products) { const s = m.get(p.supplier_id) || { products: 0 }; s.products++; m.set(p.supplier_id, s); }
    }
    return m;
  }, [db, kind]);

  const rows = db[kind].filter((r) => !q || Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={spec.title}>
        <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={15} /> {spec.singular} חדש</button>
      </PageHeader>
      <Panel title={`${rows.length} ${spec.title}`} icon={spec.icon} bodyClass="p-0" actions={<SearchBox value={q} onChange={setQ} />}>
        {kind === 'customers' ? (
          <Table className="max-h-[calc(100vh-230px)]" head={['קוד', 'שם', 'רשת', 'עיר', 'אזור', 'טלפון', { label: 'הזמנות', end: 1 }, { label: 'פתוחות', end: 1 }, { label: 'מחזור', end: 1 }, 'הזמנה אחרונה']}>
            {rows.map((c) => { const s = stats.get(c.id) || {}; return (
              <tr key={c.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setEdit(c)}>
                <td className="num px-3 py-2 text-xs text-slate-400">{c.code}</td>
                <td className="px-3 py-2 text-slate-100">{c.name}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{c.chain}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{c.city}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{c.region}</td>
                <td className="num px-3 py-2 text-xs text-slate-400">{c.phone}</td>
                <td className="num px-3 py-2 text-end">{fmt(s.orders || 0)}</td>
                <td className="num px-3 py-2 text-end text-surge-soft">{s.open || '–'}</td>
                <td className="num px-3 py-2 text-end text-slate-300">{fmtMoney(s.value || 0)}</td>
                <td className="num px-3 py-2 text-xs text-slate-500">{s.last ? fmtDate(s.last.slice(0, 10)) : '—'}</td>
              </tr>); })}
          </Table>
        ) : (
          <Table head={['שם', 'טלפון', 'אימייל', { label: 'ימי אספקה', end: 1 }, { label: 'מוצרים', end: 1 }]}>
            {rows.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setEdit(s)}>
                <td className="px-3 py-2 text-slate-100">{s.name}</td>
                <td className="num px-3 py-2 text-xs text-slate-400">{s.phone}</td>
                <td className="num px-3 py-2 text-xs text-slate-400">{s.email}</td>
                <td className="num px-3 py-2 text-end">{s.lead_days}</td>
                <td className="num px-3 py-2 text-end">{stats.get(s.id)?.products || 0}</td>
              </tr>
            ))}
          </Table>
        )}
        {!rows.length && <Empty>אין רשומות</Empty>}
      </Panel>
      {edit && <EditModal kind={kind} spec={spec} row={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditModal({ kind, spec, row, onClose }) {
  const { run, busy } = useData();
  const [f, setF] = useState({ ...row });
  const save = async () => {
    const r = { ...f };
    if ('lead_days' in r || kind === 'suppliers') r.lead_days = Number(r.lead_days || 3);
    if (!r.id) r.active = true;
    const ok = await run((d, be) => saveEntity(be, kind, r), 'נשמר');
    if (ok) onClose();
  };
  const del = async () => {
    if (!confirm('למחוק?')) return;
    const ok = await run((d, be) => deleteEntity(d, be, kind, f.id).then(() => true), 'נמחק');
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={f.id ? `עריכת ${spec.singular}` : `${spec.singular} חדש`} icon={spec.icon}
      footer={<>
        {f.id && <button className="btn me-auto text-critical-soft" onClick={del}><Trash2 size={14} /> מחיקה</button>}
        <button className="btn" onClick={onClose}>ביטול</button>
        <button className="btn btn-primary" disabled={busy || !f.name} onClick={save}>שמירה</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        {spec.fields.map(([k, l, span]) => (
          <Field key={k} label={l} className={span === 2 ? 'col-span-2' : ''}>
            <Input value={f[k] ?? ''} type={k === 'lead_days' ? 'number' : 'text'} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
