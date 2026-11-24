import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Ghost, Siren, TrendingUp, PackageX, Boxes, Activity, HeartPulse } from 'lucide-react';
import { fmtN } from '../lib/engine.js';
import { longDate } from '../lib/dates.js';

function Kpi({ icon: Icon, label, value, sub, tone = 'slate', pulse, onClick, active }) {
  const tones = {
    amber: 'text-phantom border-phantom/40',
    red: 'text-critical border-critical/40',
    green: 'text-healthy border-healthy/40',
    sky: 'text-surge border-surge/40',
    violet: 'text-void border-void/40',
    slate: 'text-slate-200 border-coal-700',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`group relative flex min-w-[150px] flex-1 flex-col gap-1 border-s px-4 py-3 text-start transition ${
        onClick ? 'hover:bg-white/[0.03] cursor-pointer' : ''
      } ${active ? 'bg-white/[0.05]' : ''} ${tones[tone].split(' ')[1]}`}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-slate-400">
        <Icon size={13} className={tones[tone].split(' ')[0]} />
        {label}
        {pulse && (
          <span className="relative ms-auto flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full animate-ping2 rounded-full ${pulse}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${pulse}`} />
          </span>
        )}
      </div>
      <div className={`num text-2xl font-semibold leading-none text-end ${tones[tone].split(' ')[0]}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </Tag>
  );
}

export default function PulseStrip({ kpis, onStatusClick, statusFilter }) {
  const healthPct = Math.round(kpis.health * 100);
  const delta = kpis.deltaVs7 * 100;
  const isActive = (s) => statusFilter.length === 1 && statusFilter[0] === s;
  return (
    <section className="glass corner relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
        <div className="scanline h-px w-1/3 animate-scan" />
      </div>
      <div className="flex flex-wrap items-stretch">
        {/* Network pulse sparkline */}
        <div className="flex min-w-[260px] flex-[1.4] items-center gap-3 px-4 py-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-slate-400">
              <Activity size={13} className="text-healthy" />
              דופק מכירות רשתי
            </div>
            <div className="num text-2xl font-semibold leading-none text-slate-100">{fmtN(kpis.lastTot)}</div>
            <div className="text-[11px] text-slate-500">
              יח׳ ב-<span className="num">{longDate(kpis.asOf)}</span>{' '}
              <span className={`num ${delta >= 0 ? 'text-healthy' : 'text-critical'}`}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
              </span>{' '}
              מול ממוצע 7 ימים
            </div>
          </div>
          <div className="h-14 min-w-[110px] flex-1" title="30 ימים · החדש משמאל">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={kpis.network} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide reversed />
                <YAxis hide domain={['dataMin - 50', 'dataMax + 50']} />
                <Area type="monotone" dataKey="qty" stroke="#10B981" strokeWidth={1.5} fill="url(#pulseFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Kpi icon={Ghost} label="מלאי רפאים" tone="amber" value={kpis.phantom} pulse={kpis.phantom ? 'bg-phantom' : null}
          sub={<><span className="num">{fmtN(kpis.stuckUnits)}</span> יח׳ תקועות</>} onClick={() => onStatusClick('phantom')} active={isActive('phantom')} />
        <Kpi icon={Siren} label="חריגות קריטיות" tone="red" value={kpis.critical} pulse={kpis.critical ? 'bg-critical' : null}
          sub={<><span className="num">{kpis.drop}</span> ירידות נוספות</>} onClick={() => onStatusClick('critical')} active={isActive('critical')} />
        <Kpi icon={PackageX} label="אזל מהמלאי" tone="violet" value={kpis.oos}
          sub="מלאי 0 במערכת" onClick={() => onStatusClick('oos')} active={isActive('oos')} />
        <Kpi icon={TrendingUp} label="קפיצות ביקוש" tone="sky" value={kpis.spike}
          sub="Z ≥ סף עליון" onClick={() => onStatusClick('spike')} active={isActive('spike')} />
        <Kpi icon={Boxes} label="מכירות אבודות" tone="slate" value={fmtN(kpis.lostUnits)}
          sub={<>~<span className="num">{fmtN(kpis.lostPerDay)}</span> יח׳/יום בסיכון</>} />
        <Kpi icon={HeartPulse} label="בריאות מדף" tone={healthPct >= 90 ? 'green' : healthPct >= 80 ? 'amber' : 'red'}
          value={`${healthPct}%`} sub={<><span className="num">{kpis.stores}</span> סניפים · <span className="num">{kpis.skus}</span> מק״טים</>} />
      </div>
    </section>
  );
}
