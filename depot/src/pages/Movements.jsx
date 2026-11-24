import { useMemo, useState } from 'react';
import { History, Download } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Table, SearchBox, Select, Input, Empty } from '../components/ui.jsx';
import { MOVE_TYPES, fmt, fmtDateTime, fmtDate } from '../lib/inventory.js';
import { exportXlsx } from '../lib/excel.js';

export default function Movements() {
  const { db, idx } = useData();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState(new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));

  const orderById = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders]);
  const poById = useMemo(() => new Map(db.purchase_orders.map((o) => [o.id, o])), [db.purchase_orders]);
  const ref = (m) => {
    if (m.ref_type === 'order') { const o = orderById.get(m.ref_id); return `${o?.number || ''} · ${idx.customer.get(o?.customer_id)?.name || ''}`; }
    if (m.ref_type === 'po') { const p = poById.get(m.ref_id); return `${p?.number || ''} · ${idx.supplier.get(p?.supplier_id)?.name || ''}`; }
    if (m.ref_type === 'supplier') return idx.supplier.get(m.ref_id)?.name || m.note;
    return m.note;
  };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.movements
      .filter((m) => m.ts.slice(0, 10) >= from && (!type || m.type === type))
      .filter((m) => { if (!s) return true; const p = idx.product.get(m.product_id); return `${p?.name} ${p?.sku} ${idx.lot.get(m.lot_id)?.lot_no} ${m.note}`.toLowerCase().includes(s); })
      .sort((a, b) => b.ts.localeCompare(a.ts));
  }, [db.movements, idx, q, type, from]);

  const doExport = () => exportXlsx('תנועות-מלאי.xlsx', rows.map((m) => {
    const p = idx.product.get(m.product_id); const l = idx.lot.get(m.lot_id);
    return { 'מועד': fmtDateTime(m.ts), 'סוג': MOVE_TYPES[m.type]?.label, 'מק״ט': p?.sku, 'מוצר': p?.name, 'אצווה': l?.lot_no, 'תפוגה': l?.expiry || '', 'כמות': m.qty, 'אסמכתא': ref(m), 'משתמש': m.user_email };
  }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="יומן תנועות" sub="כל שינוי במלאי נרשם כאן – לא ניתן למחוק תנועות, רק לתקן בתנועה נגדית">
        <button className="btn" onClick={doExport} disabled={!rows.length}><Download size={15} /> ייצוא לאקסל</button>
      </PageHeader>
      <Panel title={`${fmt(rows.length)} תנועות`} icon={History} tone="text-surge" bodyClass="p-0"
        actions={<>
          <SearchBox value={q} onChange={setQ} placeholder="מוצר / אצווה / הערה" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-36"><option value="">כל הסוגים</option>{Object.entries(MOVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="num !w-40" title="מתאריך" />
        </>}>
        <Table className="max-h-[calc(100vh-230px)]" head={['מועד', 'סוג', 'מוצר', 'אצווה', { label: 'כמות', end: 1 }, 'אסמכתא', 'משתמש']}>
          {rows.slice(0, 500).map((m) => {
            const l = idx.lot.get(m.lot_id);
            return (
              <tr key={m.id}>
                <td className="num px-3 py-1.5 text-xs text-slate-400">{fmtDateTime(m.ts)}</td>
                <td className="px-3 py-1.5 text-xs" style={{ color: MOVE_TYPES[m.type]?.color }}>{MOVE_TYPES[m.type]?.label || m.type}</td>
                <td className="px-3 py-1.5 text-slate-100">{idx.product.get(m.product_id)?.name}</td>
                <td className="num px-3 py-1.5 text-xs text-slate-400">{l?.lot_no}{l?.expiry ? ` · ${fmtDate(l.expiry)}` : ''}</td>
                <td className={`num px-3 py-1.5 text-end font-semibold ${m.qty > 0 ? 'text-healthy' : 'text-critical-soft'}`}>{m.qty > 0 ? '+' : ''}{fmt(m.qty)}</td>
                <td className="max-w-[260px] truncate px-3 py-1.5 text-xs text-slate-400">{ref(m)}</td>
                <td className="px-3 py-1.5 text-[11px] text-slate-500">{m.user_email}</td>
              </tr>
            );
          })}
        </Table>
        {!rows.length && <Empty>אין תנועות בטווח</Empty>}
        {rows.length > 500 && <div className="border-t border-coal-700 p-2 text-center text-[11px] text-slate-500">מוצגות 500 הראשונות – לצמצום השתמשו בסינון או ייצאו לאקסל</div>}
      </Panel>
    </div>
  );
}
