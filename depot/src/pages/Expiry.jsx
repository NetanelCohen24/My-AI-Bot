import { useMemo, useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Badge, Table, Empty, Modal, Field, Input } from '../components/ui.jsx';
import { fmt, fmtMoney, fmtDate, daysBetween } from '../lib/inventory.js';
import { writeOff } from '../lib/ops.js';

const BUCKETS = [
  ['expired', 'פג תוקף', '#FF3B5C'],
  ['critical', 'עד 7 ימים', '#FF6B81'],
  ['soon', '8–30 ימים', '#F59E0B'],
  ['ok', 'מעל 30 ימים', '#10B981'],
];

export default function Expiry() {
  const { summary, today, run, busy } = useData();
  const [bucket, setBucket] = useState('soon-all');
  const [wo, setWo] = useState(null);

  const lots = useMemo(() => summary.flatMap((s) => s.lots.filter((l) => l.expiry).map((l) => ({ ...l, product: s.product, days: daysBetween(l.expiry, today) })))
    .sort((a, b) => a.expiry.localeCompare(b.expiry)), [summary, today]);
  const counts = Object.fromEntries(BUCKETS.map(([k]) => [k, lots.filter((l) => l.state === k)]));
  const shown = bucket === 'soon-all' ? lots.filter((l) => l.state !== 'ok') : counts[bucket];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="תוקף ואצוות" sub="משלוחים יוצאים לפי FEFO. אצווה שפג תוקפה לא תוקצה ללקוחות – יש לגרוע אותה מהמלאי." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {BUCKETS.map(([k, l, c]) => (
          <button key={k} onClick={() => setBucket(bucket === k ? 'soon-all' : k)} className={`glass px-4 py-3 text-start transition hover:border-slate-500 ${bucket === k ? 'ring-1 ring-white/40' : ''}`}>
            <div className="text-[11px] text-slate-400">{l}</div>
            <div className="num text-end text-2xl font-semibold" style={{ color: c }}>{counts[k].length}</div>
            <div className="text-[11px] text-slate-500"><span className="num">{fmt(counts[k].reduce((s, x) => s + x.qty, 0))}</span> יח׳ · <span className="num">{fmtMoney(counts[k].reduce((s, x) => s + x.qty * (x.product.cost || 0), 0))}</span></div>
          </button>
        ))}
      </div>
      <Panel title={bucket === 'soon-all' ? 'אצוות שדורשות תשומת לב' : BUCKETS.find((b) => b[0] === bucket)[1]} icon={CalendarClock} bodyClass="p-0">
        <Table className="max-h-[calc(100vh-330px)]" head={['מוצר', 'אצווה', 'תפוגה', { label: 'ימים', end: 1 }, { label: 'כמות', end: 1 }, { label: 'שווי', end: 1 }, '']}>
          {shown.map((l) => {
            const c = BUCKETS.find((b) => b[0] === l.state)?.[2];
            return (
              <tr key={l.id}>
                <td className="px-3 py-2"><div className="text-slate-100">{l.product.name}</div><div className="num text-[10px] text-slate-500">{l.product.sku}</div></td>
                <td className="num px-3 py-2 text-xs text-slate-300">{l.lot_no}</td>
                <td className="num px-3 py-2" style={{ color: c }}>{fmtDate(l.expiry)}</td>
                <td className="num px-3 py-2 text-end" style={{ color: c }}>{l.days}</td>
                <td className="num px-3 py-2 text-end">{fmt(l.qty)}</td>
                <td className="num px-3 py-2 text-end text-slate-400">{fmtMoney(l.qty * (l.product.cost || 0))}</td>
                <td className="px-3 py-2 text-end">
                  {l.state === 'expired'
                    ? <button className="btn text-xs text-critical-soft" disabled={busy} onClick={() => setWo({ lot: l, qty: l.qty, reason: 'פג תוקף' })}><Trash2 size={13} /> גריעה</button>
                    : <Badge color={c}>{l.state === 'critical' ? 'לדחוף למכירה' : l.state === 'soon' ? 'לעקוב' : 'תקין'}</Badge>}
                </td>
              </tr>
            );
          })}
        </Table>
        {!shown.length && <Empty>אין אצוות בקטגוריה זו</Empty>}
      </Panel>
      {wo && (
        <Modal open onClose={() => setWo(null)} title="גריעת מלאי" icon={Trash2}
          footer={<><button className="btn" onClick={() => setWo(null)}>ביטול</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => run((d, be) => writeOff(d, be, wo), 'המלאי נגרע').then(() => setWo(null))}>אישור גריעה</button></>}>
          <p className="mb-3 text-sm text-slate-300">{wo.lot.product.name} · אצווה <span className="num">{wo.lot.lot_no}</span></p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="כמות"><Input type="number" value={wo.qty} max={wo.lot.qty} onChange={(e) => setWo({ ...wo, qty: e.target.value })} /></Field>
            <Field label="סיבה"><Input value={wo.reason} onChange={(e) => setWo({ ...wo, reason: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
