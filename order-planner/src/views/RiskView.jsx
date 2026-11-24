import { useMemo } from 'react';
import { CalendarX2, ShieldAlert } from 'lucide-react';
import { Panel, Table, Empty, Badge } from '../components/ui.jsx';
import { fmt, fmtDate, fmtMoney, addDays } from '../lib/engine.js';

/** Batches that won't sell before their block date, plus stock already past it. */
export default function RiskView({ result, onSelect }) {
  const { future, past } = useMemo(() => {
    const future = [];
    const past = [];
    for (const i of result.items) {
      for (const b of i.batches) {
        if (b.src !== 'stock' || b.wasted < 0.5) continue;
        const row = { i, b, blockDate: addDays(result.asOf, b.block), value: b.wasted * i.unitValue };
        (b.block <= 0 ? past : future).push(row);
      }
    }
    future.sort((a, z) => a.b.block - z.b.block);
    past.sort((a, z) => z.b.wasted - a.b.wasted);
    return { future, past };
  }, [result]);

  const advice = (r) => {
    const days = r.b.block;
    const share = r.b.wasted / Math.max(1, r.b.qty);
    if (days <= 30) return share > 0.5 ? 'תרומה / מכירה ללקוח מוסדי' : 'מבצע מיידי';
    if (days <= 90) return 'לתכנן מבצע בחודשים הקרובים';
    return 'לעקוב – לשקול הקטנת הזמנות';
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title="יפוגו לפני שיימכרו" icon={CalendarX2} tone="text-void" bodyClass="p-0"
        actions={<span className="text-[11px] text-slate-500">לפי קצב המכירה הצפוי ו-FEFO (התוקף הקרוב נמכר ראשון)</span>}>
        {!future.length ? <Empty>אין אצוות בסכנה 🎯</Empty> : (
          <Table head={['מוצר', 'תוקף', 'נחסם ב', { label: 'כמות באצווה', end: 1 }, { label: 'לא יימכרו', end: 1 }, { label: 'שווי', end: 1 }, 'המלצה']}>
            {future.map((r, k) => (
              <tr key={k} onClick={() => onSelect(r.i.sku)} className="cursor-pointer hover:bg-white/[0.03]">
                <td className="px-3 py-2"><div className="text-slate-100">{r.i.name}</div><div className="num text-[10px] text-slate-500">{r.i.sku} · מכר {fmt(r.i.f.monthly)}/חודש</div></td>
                <td className="num px-3 py-2 text-xs text-slate-300">{fmtDate(r.b.expiry)}</td>
                <td className="num px-3 py-2 text-xs text-void-soft">{fmtDate(r.blockDate)}<div className="text-[10px] text-slate-500">בעוד {r.b.block} ימים</div></td>
                <td className="num px-3 py-2 text-end text-slate-400">{fmt(r.b.qty)}</td>
                <td className="num px-3 py-2 text-end font-semibold text-critical-soft">{fmt(r.b.wasted)}</td>
                <td className="num px-3 py-2 text-end text-slate-300">{r.value ? fmtMoney(r.value) : '—'}</td>
                <td className="px-3 py-2"><Badge color={r.b.block <= 30 ? '#FF3B5C' : r.b.block <= 90 ? '#F59E0B' : '#64748B'}>{advice(r)}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel title="כבר עבר מועד החסימה" icon={ShieldAlert} tone="text-critical" bodyClass="p-0">
        {!past.length ? <Empty>אין מלאי שעבר את מועד החסימה</Empty> : (
          <Table head={['מוצר', 'תוקף', { label: 'תיבות', end: 1 }, { label: 'שווי', end: 1 }]}>
            {past.map((r, k) => (
              <tr key={k} onClick={() => onSelect(r.i.sku)} className="cursor-pointer hover:bg-white/[0.03]">
                <td className="px-3 py-2"><div className="text-slate-100">{r.i.name}</div><div className="num text-[10px] text-slate-500">{r.i.sku}</div></td>
                <td className="num px-3 py-2 text-xs text-critical-soft">{fmtDate(r.b.expiry)}</td>
                <td className="num px-3 py-2 text-end">{fmt(r.b.wasted)}</td>
                <td className="num px-3 py-2 text-end text-slate-300">{r.value ? fmtMoney(r.value) : '—'}</td>
              </tr>
            ))}
          </Table>
        )}
        <p className="border-t border-coal-700 px-4 py-2 text-[11px] text-slate-500">ייתכן שזה מלאי ישן בקובץ שכבר טופל, או תאריך תוקף שהוזן לא נכון – כדאי לבדוק מול המחסן.</p>
      </Panel>
    </div>
  );
}
