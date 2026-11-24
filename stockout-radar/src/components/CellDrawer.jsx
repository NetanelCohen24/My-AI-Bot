import { useEffect, useMemo, useState } from 'react';
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { X, Copy, Check, Ghost, Siren, PackageX, TrendingUp, TrendingDown, CircleCheck, Crosshair } from 'lucide-react';
import { STATUS, cellTrend, fmtN, fmtZ, fmtCover } from '../lib/engine.js';
import { shortDate, heDow, longDate } from '../lib/dates.js';
import { actionFor } from '../lib/tasks.js';

const ICONS = { phantom: Ghost, critical: Siren, oos: PackageX, drop: TrendingDown, spike: TrendingUp, ok: CircleCheck, idle: CircleCheck };

function barColor(d, status) {
  if (d.qty === 0 && (status === 'phantom' || status === 'oos')) return '#F59E0B';
  if (d.z <= -2) return '#FF3B5C';
  if (d.z >= 2) return '#38BDF8';
  return '#334155';
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass p-2.5 text-xs" style={{ background: 'rgba(11,15,25,.95)' }}>
      <div className="mb-1 font-semibold text-slate-200">
        יום {heDow(d.date)} · <span className="num">{longDate(d.date)}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-slate-500">מכירות</span><span className="num text-end text-slate-100">{d.qty}</span>
        <span className="text-slate-500">צפי עונתי</span><span className="num text-end text-slate-300">{d.expected}</span>
        <span className="text-slate-500">MA28</span><span className="num text-end text-slate-300">{d.ma}</span>
        <span className="text-slate-500">טווח ±2σ</span><span className="num text-end text-slate-400">{d.band[0]}–{d.band[1]}</span>
        <span className="text-slate-500">Z</span><span className={`num text-end ${Math.abs(d.z) >= 2 ? 'text-critical-soft' : 'text-slate-300'}`}>{fmtZ(d.z)}</span>
        <span className="text-slate-500">מלאי POS</span><span className="num text-end text-phantom-soft">{d.inv ?? '—'}</span>
      </div>
    </div>
  );
}

export default function CellDrawer({ cell, series, days, settings, onClose }) {
  const [copied, setCopied] = useState(false);
  const open = !!cell;
  const trend = useMemo(() => (cell && series ? cellTrend(series, days, settings, 30) : []), [cell, series, days, settings]);

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => setCopied(false), [cell?.key]);

  const st = cell ? STATUS[cell.status] : null;
  const Icon = cell ? ICONS[cell.status] : X;

  const copyTask = async () => {
    const txt = `*${cell.storeName} #${cell.store}* (${cell.chain})\n${cell.product} [${cell.sku}]\n${st.label} – ${actionFor(cell)}`;
    try { await navigator.clipboard.writeText(txt); } catch { /* clipboard may be blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      {/* RTL: the drawer enters from the inline-end edge (left of screen). */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="ניתוח תא"
        className={`fixed inset-y-0 end-0 z-50 flex w-full max-w-[620px] flex-col border-s border-coal-700 bg-coal-900/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {cell && (
          <>
            <div className="h-1 w-full" style={{ background: `linear-gradient(to left, ${st.color}, transparent)` }} />
            <header className="flex items-start gap-3 border-b border-coal-700 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: st.color + '80', background: st.color + '1a', color: st.color }}>
                <Icon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.color + '22', color: st.color }}>{st.label}</span>
                  <span className="text-xs text-slate-500">{cell.chain} · אזור {cell.region}</span>
                </div>
                <h3 className="truncate text-lg font-semibold text-white">{cell.product}</h3>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                  <span>{cell.storeName} <span className="num text-slate-300">#{cell.store}</span></span>
                  <span className="num text-slate-500">SKU {cell.sku}</span>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-coal-700 hover:text-white" aria-label="סגירה"><X size={18} /></button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Metric grid */}
              <div className="grid grid-cols-3 gap-2">
                <Metric label="מלאי POS" value={fmtN(cell.invNow)} tone={cell.status === 'phantom' ? 'text-phantom' : ''} />
                <Metric label="מכירה אחרונה" value={fmtN(cell.lastQty)} />
                <Metric label="צפי עונתי" value={fmtN(cell.expected, 1)} />
                <Metric label="MA28" value={fmtN(cell.ma, 1)} />
                <Metric label="σ (שארית)" value={fmtN(cell.sigma, 2)} />
                <Metric label="Z יומי / 3 ימים" value={`${fmtZ(cell.z)} / ${fmtZ(cell.z3)}`} tone={Math.abs(cell.z) >= 2 || Math.abs(cell.z3) >= 2 ? 'text-critical-soft' : ''} small />
                <Metric label="רצף ימי אפס" value={cell.zeroStreak} tone={cell.zeroStreak >= settings.zeroDays ? 'text-phantom' : ''} />
                <Metric label="ימי כיסוי" value={fmtCover(cell.daysCover)} tone={cell.daysCover < 2 ? 'text-surge' : ''} />
                <Metric label="ודאות רפאים" value={cell.zeroStreak ? `${(cell.confidence * 100).toFixed(1)}%` : '—'} />
              </div>

              {/* Trend chart */}
              <section className="glass p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="panel-title">מגמת 30 יום</h4>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-600" />מכירות</span>
                    <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-healthy" />צפי</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-healthy/15 ring-1 ring-healthy/30" />±2σ</span>
                    <span className="flex items-center gap-1"><span className="h-0.5 w-3 border-t border-dashed border-phantom" />מלאי</span>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trend} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#1E293B" strokeDasharray="2 4" vertical={false} />
                      {/* RTL timeline: oldest on the right, newest on the left. */}
                      <XAxis dataKey="date" reversed tickFormatter={shortDate} tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        axisLine={{ stroke: '#1E293B' }} tickLine={false} interval={4} />
                      <YAxis yAxisId="q" orientation="right" tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={34} />
                      <YAxis yAxisId="inv" orientation="left" tick={{ fill: '#B45309', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={34} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(148,163,184,.06)' }} />
                      <Area yAxisId="q" dataKey="band" stroke="none" fill="#10B981" fillOpacity={0.1} isAnimationActive={false} />
                      <Bar yAxisId="q" dataKey="qty" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false}>
                        {trend.map((d) => <Cell key={d.date} fill={barColor(d, cell.status)} fillOpacity={d.qty === 0 ? 1 : 0.9} />)}
                      </Bar>
                      <Line yAxisId="q" dataKey="expected" stroke="#10B981" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                      <Line yAxisId="q" dataKey="ma" stroke="#64748B" strokeWidth={1} strokeDasharray="1 3" dot={false} isAnimationActive={false} />
                      <Line yAxisId="inv" dataKey="inv" type="stepAfter" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                      {cell.zeroStreak > 0 && trend.length > cell.zeroStreak && (
                        <ReferenceArea yAxisId="q" x1={trend[trend.length - cell.zeroStreak].date} x2={trend.at(-1).date}
                          fill="#F59E0B" fillOpacity={0.08} stroke="none" />
                      )}
                      {cell.zeroStreak > 0 && trend.length > cell.zeroStreak && (
                        <ReferenceLine yAxisId="q" x={trend[trend.length - cell.zeroStreak].date} stroke="#F59E0B" strokeOpacity={0.6}
                          label={{ value: 'תחילת רצף אפס', fill: '#F59E0B', fontSize: 10, position: 'insideTopLeft' }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Diagnosis */}
              <section className="rounded-xl border p-4" style={{ borderColor: st.color + '55', background: st.color + '0d' }}>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: st.color }}>
                  <Crosshair size={15} /> אבחון והמלצה
                </h4>
                {cell.reasons.length > 0 && (
                  <ul className="mb-2 space-y-1 text-xs text-slate-300">
                    {cell.reasons.map((r) => <li key={r} className="flex gap-2"><span style={{ color: st.color }}>▸</span>{r}</li>)}
                  </ul>
                )}
                <p className="text-sm leading-relaxed text-slate-200">{actionFor(cell) || 'הסדרה בטווח הצפוי – אין צורך בפעולה.'}</p>
                {cell.status !== 'ok' && cell.status !== 'idle' && (
                  <button onClick={copyTask} className="btn btn-amber mt-3 text-xs">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'הועתק' : 'העתק משימה בודדת'}
                  </button>
                )}
              </section>

              {/* Last 10 days */}
              <section>
                <h4 className="panel-title mb-2">10 ימים אחרונים</h4>
                <div className="overflow-hidden rounded-xl border border-coal-700">
                  <table className="w-full text-xs">
                    <thead className="bg-coal-800/80 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-start font-medium">תאריך</th>
                        <th className="px-3 py-2 text-start font-medium">יום</th>
                        <th className="px-3 py-2 text-end font-medium">מכירות</th>
                        <th className="px-3 py-2 text-end font-medium">צפי</th>
                        <th className="px-3 py-2 text-end font-medium">Z</th>
                        <th className="px-3 py-2 text-end font-medium">מלאי</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.slice(-10).reverse().map((d) => (
                        <tr key={d.date} className="border-t border-coal-700/70">
                          <td className="num px-3 py-1.5 text-start text-slate-300">{longDate(d.date)}</td>
                          <td className="px-3 py-1.5 text-slate-500">{heDow(d.date)}</td>
                          <td className={`num px-3 py-1.5 text-end ${d.qty === 0 ? 'text-phantom' : 'text-slate-100'}`}>{d.qty}</td>
                          <td className="num px-3 py-1.5 text-end text-slate-500">{d.expected}</td>
                          <td className={`num px-3 py-1.5 text-end ${d.z <= -2 ? 'text-critical-soft' : d.z >= 2 ? 'text-surge-soft' : 'text-slate-400'}`}>{fmtZ(d.z)}</td>
                          <td className="num px-3 py-1.5 text-end text-slate-300">{d.inv ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Metric({ label, value, tone = '', small }) {
  return (
    <div className="rounded-lg border border-coal-700 bg-coal-850/70 px-3 py-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`num ${small ? 'text-sm' : 'text-lg'} text-end font-semibold text-slate-100 ${tone}`}>{value}</div>
    </div>
  );
}
