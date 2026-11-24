import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Boxes, TriangleAlert, CalendarClock, ClipboardList, Truck, Wallet, Activity, PackageX } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { Panel, Stat, Badge, Empty } from '../components/ui.jsx';
import { ORDER_STATUS, STOCK_STATUS, fmt, fmtMoney, fmtDate, daysBetween } from '../lib/inventory.js';

export default function Dashboard({ go }) {
  const { db, summary, idx, today } = useData();

  const k = useMemo(() => {
    const open = db.orders.filter((o) => ORDER_STATUS[o.status]?.reserves);
    const expLots = summary.flatMap((s) => s.lots.filter((l) => ['expired', 'critical', 'soon'].includes(l.state)).map((l) => ({ ...l, product: s.product })));
    return {
      value: summary.reduce((a, s) => a + s.value, 0),
      units: summary.reduce((a, s) => a + s.usable, 0),
      low: summary.filter((s) => s.status === 'low'),
      out: summary.filter((s) => s.status === 'out' || s.status === 'over'),
      open,
      dueToday: open.filter((o) => o.due_date <= today),
      expired: expLots.filter((l) => l.state === 'expired'),
      expSoon: expLots.filter((l) => l.state !== 'expired').sort((a, b) => a.expiry.localeCompare(b.expiry)),
      suggest: summary.filter((s) => s.suggest > 0),
    };
  }, [db, summary, today]);

  // 21-day in/out flow chart. RTL: newest on the left via reversed axis.
  const flow = useMemo(() => {
    const days = [];
    for (let i = 20; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    const m = new Map(days.map((d) => [d, { date: d, in: 0, out: 0 }]));
    for (const mv of db.movements) {
      const r = m.get(mv.ts.slice(0, 10));
      if (!r) continue;
      if (mv.type === 'receipt') r.in += Number(mv.qty);
      if (mv.type === 'shipment') r.out += -Number(mv.qty);
    }
    return [...m.values()];
  }, [db.movements]);

  const alerts = [
    ...k.out.map((s) => ({ tone: '#FF3B5C', icon: PackageX, title: s.product.name, text: s.status === 'out' ? 'אזל מהמלאי' : `חסרות ${fmt(-s.available)} יח׳ להזמנות פתוחות`, to: 'inventory' })),
    ...k.expired.map((l) => ({ tone: '#FF3B5C', icon: CalendarClock, title: l.product.name, text: `אצווה ${l.lot_no} פגה ב-${fmtDate(l.expiry)} · ${fmt(l.qty)} יח׳ לגריעה`, to: 'expiry' })),
    ...k.expSoon.filter((l) => l.state === 'critical').map((l) => ({ tone: '#F59E0B', icon: CalendarClock, title: l.product.name, text: `${fmt(l.qty)} יח׳ פגות בעוד ${daysBetween(l.expiry, today)} ימים`, to: 'expiry' })),
    ...k.low.map((s) => ({ tone: '#F59E0B', icon: TriangleAlert, title: s.product.name, text: `זמין ${fmt(s.available)} · נקודת הזמנה ${fmt(s.reorderPoint)}`, to: 'purchasing' })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Wallet} label="שווי מלאי (עלות)" value={fmtMoney(k.value)} sub={<><span className="num">{fmt(k.units)}</span> יח׳ שמישות</>} tone="text-healthy" />
        <Stat icon={PackageX} label="חוסרים" value={k.out.length} sub="אזלו / לא מכסים הזמנות" tone="text-critical" onClick={() => go('inventory')} />
        <Stat icon={TriangleAlert} label="מתחת למינימום" value={k.low.length} sub={<><span className="num">{k.suggest.length}</span> הצעות רכש</>} tone="text-phantom" onClick={() => go('purchasing')} />
        <Stat icon={CalendarClock} label="תוקף קרוב / פג" value={`${k.expSoon.length} / ${k.expired.length}`} sub="אצוות ב-30 יום הקרובים" tone="text-phantom" onClick={() => go('expiry')} />
        <Stat icon={ClipboardList} label="הזמנות פתוחות" value={k.open.length} sub={<><span className="num">{k.dueToday.length}</span> לאספקה היום</>} tone="text-surge" onClick={() => go('orders')} />
        <Stat icon={Boxes} label="מוצרים פעילים" value={db.products.length} sub={<><span className="num">{db.customers.length}</span> לקוחות · <span className="num">{db.suppliers.length}</span> ספקים</>} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="תנועת סחורה – 21 ימים" icon={Activity} tone="text-healthy">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flow} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" reversed tickFormatter={(d) => `${d.slice(8)}/${d.slice(5, 7)}`} tick={{ fill: 'var(--tick)', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} interval={2} />
                <YAxis orientation="right" tick={{ fill: 'var(--tick)', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,.06)' }} contentStyle={{ background: 'var(--tip-bg)', border: '1px solid var(--grid)', color: 'var(--tick)', borderRadius: 10, fontSize: 12 }}
                  labelFormatter={fmtDate} formatter={(v, n) => [fmt(v), n === 'in' ? 'נקלט' : 'נשלח']} />
                <Bar dataKey="in" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={12} />
                <Bar dataKey="out" fill="#38BDF8" radius={[3, 3, 0, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-healthy" />נקלט מספקים</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-surge" />נשלח ללקוחות</span>
          </div>
        </Panel>

        <Panel title="דורש טיפול" icon={TriangleAlert} tone="text-critical" bodyClass="p-2" actions={<span className="num rounded-full bg-critical/15 px-2 text-[11px] text-critical-soft">{alerts.length}</span>}>
          <ul className="max-h-[300px] space-y-1 overflow-y-auto">
            {alerts.length === 0 && <Empty>הכול תקין 🎯</Empty>}
            {alerts.map((a, i) => (
              <li key={i}>
                <button onClick={() => go(a.to)} className="flex w-full items-start gap-3 rounded-lg p-2.5 text-start hover:bg-white/[0.04]">
                  <a.icon size={16} style={{ color: a.tone }} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-slate-100">{a.title}</span>
                    <span className="block text-[11px] text-slate-400">{a.text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="הזמנות לקוחות פתוחות" icon={Truck} tone="text-surge" bodyClass="p-0" actions={<button className="text-xs text-slate-400 hover:text-white" onClick={() => go('orders')}>לכל ההזמנות ←</button>}>
          <ul className="divide-y divide-coal-700/60">
            {k.open.length === 0 && <Empty>אין הזמנות פתוחות</Empty>}
            {[...k.open].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 7).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="num text-slate-400">{o.number}</span>
                <span className="flex-1 truncate text-slate-200">{idx.customer.get(o.customer_id)?.name}</span>
                <span className={`num text-xs ${o.due_date <= today ? 'text-phantom' : 'text-slate-500'}`}>{fmtDate(o.due_date)}</span>
                <Badge color={ORDER_STATUS[o.status].color}>{ORDER_STATUS[o.status].label}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="מצב מלאי – הכי קריטיים" icon={Boxes} bodyClass="p-0" actions={<button className="text-xs text-slate-400 hover:text-white" onClick={() => go('inventory')}>למלאי ←</button>}>
          <ul className="divide-y divide-coal-700/60">
            {[...summary].sort((a, b) => (a.available / Math.max(a.reorderPoint, 1)) - (b.available / Math.max(b.reorderPoint, 1))).slice(0, 7).map((s) => (
              <li key={s.product.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 truncate text-slate-200">{s.product.name}</span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-coal-700">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, (s.available / Math.max(s.reorderPoint * 2, 1)) * 100))}%`, background: STOCK_STATUS[s.status].color }} />
                </div>
                <span className="num w-14 text-end text-xs text-slate-300">{fmt(s.available)}</span>
                <Badge color={STOCK_STATUS[s.status].color}>{STOCK_STATUS[s.status].label}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
