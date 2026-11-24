import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { Plus, Trash2, Megaphone, Ship, Layers } from 'lucide-react';
import { Drawer, Badge, Table, Input } from '../components/ui.jsx';
import { STATUS, fmt, fmtDate, addDays, addMonths, monthLabel } from '../lib/engine.js';

const axis = { fill: 'var(--tick)', fontSize: 10, fontFamily: 'JetBrains Mono' };
const tip = { background: 'var(--tip-bg)', border: '1px solid var(--grid)', borderRadius: 10, fontSize: 12, color: 'var(--tick)' };

export default function ProductDrawer({ item, result, override, setOverride, onClose }) {
  return (
    <Drawer open={!!item} onClose={onClose} accent={item ? STATUS[item.status].color : undefined} width="max-w-[720px]">
      {item && <Body i={item} asOf={result.asOf} override={override || {}} setOverride={setOverride} />}
    </Drawer>
  );
}

function Body({ i, asOf, override, setOverride }) {
  const st = STATUS[i.status];

  const projection = useMemo(() => {
    const out = [];
    const end = Math.min(i.sellable.length - 1, 365);
    for (let t = 0; t <= end; t += 3) out.push({ t, date: addDays(asOf, t), stock: Math.max(0, Math.round(i.sellable[t])) });
    return out;
  }, [i, asOf]);

  const history = useMemo(() => {
    const cur = asOf.slice(0, 7);
    const rows = [];
    for (let k = 18; k >= 1; k--) { const m = addMonths(cur, -k); if (i.history?.[m] != null) rows.push({ m, v: Math.max(0, Math.round(i.history[m])), kind: 'past' }); }
    for (let k = 0; k < 4; k++) { const m = addMonths(cur, k); rows.push({ m, v: Math.round(i.f.monthly + (Number(override.promos?.[m]) || 0)), kind: 'fc' }); }
    return rows;
  }, [i, asOf, override.promos]);

  const months = [0, 1, 2, 3, 4, 5].map((k) => addMonths(asOf.slice(0, 7), k));
  const setPromo = (m, v) => setOverride(i.sku, { promos: { ...(override.promos || {}), [m]: v === '' ? undefined : Number(v) } });
  const incoming = override.incoming || [];
  const setIncoming = (list) => setOverride(i.sku, { incoming: list });

  return (
    <>
      <header className="border-b border-coal-700 p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge color={st.color}>{st.label}</Badge>
          <span className="text-xs text-slate-500">{st.hint}</span>
        </div>
        <h3 className="text-lg font-semibold text-white">{i.name}</h3>
        <div className="flex flex-wrap gap-x-3 text-xs text-slate-400">
          <span className="num">{i.sku}</span>
          {i.brand && <span>{i.brand}</span>}
          {i.supplier && <span>ספק: {i.supplier}</span>}
          <span>{i.isImport ? `יבוא${i.country ? ' · ' + i.country : ''}` : 'מקומי'}</span>
          {i.abc && <span>ABC: {i.abc}</span>}
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <M l="מלאי שמיש" v={fmt(i.sellableNow)} />
          <M l="מכר צפוי/חודש" v={fmt(i.f.monthly)} sub={i.f.trend == null ? null : `מגמה ${i.f.trend > 0 ? '+' : ''}${Math.round(i.f.trend * 100)}%`} />
          <M l="חודשי מלאי" v={i.coverMonths === Infinity ? '—' : fmt(i.coverMonths, 1)} />
          <M l="ייגמר ב" v={fmtDate(i.stockoutDate)} tone={st.color} />
          <M l="Lead time" v={`${i.lead} ימים`} />
          <M l="להזמין עד" v={i.orderByDay == null ? '—' : i.orderByDay <= 0 ? 'עכשיו' : fmtDate(i.orderByDate)} tone="#F59E0B" />
          <M l="כמות מוצעת" v={fmt(i.suggest)} sub={i.pallets ? `${fmt(i.pallets, 1)} משטחים` : null} tone="#F59E0B" />
          <M l="בסכנת תוקף" v={fmt(i.riskQty)} tone={i.riskQty >= 1 ? '#A78BFA' : undefined} />
        </div>
        {i.lostBeforeLead > 0.5 && (
          <div className="rounded-xl border border-critical/40 bg-critical/10 p-3 text-sm text-critical-soft">
            גם בהזמנה היום – צפוי חוסר של כ-<b className="num">{i.shortDaysBeforeLead}</b> ימים (~<span className="num">{fmt(i.lostBeforeLead)}</span> תיבות) עד שהסחורה תגיע. לשקול משלוח מהיר או מוצר חלופי.
          </div>
        )}
        {i.shelfCap != null && i.suggest >= i.shelfCap && (
          <div className="rounded-xl border border-void/40 bg-void/10 p-3 text-xs text-void-soft">⏳ הכמות המוצעת הוגבלה ל-<span className="num">{fmt(i.shelfCap)}</span> תיבות – יותר מזה לא יספיק להימכר לפני מועד החסימה (חיי מדף {i.shelf} ימים).</div>
        )}

        <section className="glass p-3">
          <h4 className="panel-title mb-2">מלאי שמיש צפוי – 12 חודשים</h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projection} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={st.color} stopOpacity={0.4} /><stop offset="100%" stopColor={st.color} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" reversed tickFormatter={(d) => fmtDate(d).slice(0, 5)} tick={axis} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} minTickGap={30} />
                <YAxis orientation="right" tick={axis} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tip} labelFormatter={fmtDate} formatter={(v) => [fmt(v), 'תיבות שמישות']} />
                <Area type="stepAfter" dataKey="stock" stroke={st.color} strokeWidth={1.8} fill="url(#pg)" isAnimationActive={false} />
                {i.safety > 0 && <ReferenceLine y={Math.round(i.safety)} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: 'מלאי ביטחון', fill: '#F59E0B', fontSize: 10, position: 'insideTopRight' }} />}
                {i.orderByDay != null && i.orderByDay > 0 && i.orderByDay <= 365 && <ReferenceLine x={projection.reduce((p, r) => (Math.abs(r.t - i.orderByDay) < Math.abs(p.t - i.orderByDay) ? r : p)).date} stroke="#F59E0B" label={{ value: 'להזמין', fill: '#F59E0B', fontSize: 10, position: 'insideTop' }} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">ירידות חדות = אצווה שנחסמת לפני תום התוקף. הציר מימין לשמאל (היום בצד ימין).</p>
        </section>

        <section className="glass p-3">
          <h4 className="panel-title mb-2">מכר חודשי (תיבות) + צפי</h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="m" reversed tickFormatter={monthLabel} tick={axis} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} interval={1} />
                <YAxis orientation="right" tick={axis} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tip} labelFormatter={monthLabel} formatter={(v, n, p) => [fmt(v), p.payload.kind === 'fc' ? 'צפי' : 'מכר בפועל']} />
                <Bar dataKey="v" radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false}>
                  {history.map((h) => <Cell key={h.m} fill={h.kind === 'fc' ? '#F59E0B' : '#38BDF8'} fillOpacity={h.kind === 'fc' ? 0.55 : 0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">צפי = ממוצע משוקלל של 3 החודשים האחרונים (משקל גבוה לחודש האחרון){i.f.used === 'file' ? ' · למוצר זה אין היסטוריה – נלקח "מכר ממוצע לחודש" מהקובץ' : ''}.</p>
        </section>

        <section>
          <h4 className="panel-title mb-2"><Layers size={14} className="text-phantom" /> אצוות (FEFO)</h4>
          <div className="overflow-hidden rounded-xl border border-coal-700">
            <Table head={['תוקף', 'נחסם ב', { label: 'כמות', end: 1 }, { label: 'יימכר', end: 1 }, { label: 'לא יימכר', end: 1 }, 'מקור']}>
              {i.batches.map((b) => (
                <tr key={b.id}>
                  <td className="num px-3 py-1.5 text-xs">{b.expiry ? fmtDate(b.expiry) : 'ללא'}</td>
                  <td className={`num px-3 py-1.5 text-xs ${b.block <= 0 ? 'text-critical-soft' : 'text-slate-400'}`}>{b.block === Infinity ? '—' : fmtDate(addDays(asOf, b.block))}</td>
                  <td className="num px-3 py-1.5 text-end">{fmt(b.qty)}</td>
                  <td className="num px-3 py-1.5 text-end text-healthy">{fmt(b.sold)}</td>
                  <td className={`num px-3 py-1.5 text-end ${b.wasted >= 1 ? 'font-semibold text-critical-soft' : 'text-slate-600'}`}>{b.wasted >= 1 ? fmt(b.wasted) : '—'}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">{b.src === 'order' ? 'הזמנה בדרך' : 'מלאי'}</td>
                </tr>
              ))}
            </Table>
            {!i.batches.length && <p className="p-3 text-center text-xs text-slate-500">אין מלאי בקובץ</p>}
          </div>
        </section>

        <section className="glass p-3">
          <h4 className="panel-title mb-2"><Ship size={14} className="text-surge" /> הזמנות שכבר בדרך</h4>
          <p className="mb-2 text-[11px] text-slate-500">הוסיפו משלוח שכבר הוזמן – הוא ייכנס לחישוב כאצווה חדשה בתאריך ההגעה.</p>
          {incoming.map((o, k) => (
            <div key={k} className="mb-2 flex flex-wrap items-center gap-2">
              <Input type="number" value={o.qty} placeholder="תיבות" onChange={(e) => setIncoming(incoming.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)))} className="num !w-28" />
              <Input type="date" value={o.eta} onChange={(e) => setIncoming(incoming.map((x, j) => (j === k ? { ...x, eta: e.target.value } : x)))} className="num !w-40" title="תאריך הגעה" />
              <Input type="date" value={o.expiry || ''} onChange={(e) => setIncoming(incoming.map((x, j) => (j === k ? { ...x, expiry: e.target.value } : x)))} className="num !w-40" title="תוקף (לא חובה)" />
              <button className="p-1 text-slate-500 hover:text-critical" onClick={() => setIncoming(incoming.filter((_, j) => j !== k))} aria-label="הסרה"><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="btn text-xs" onClick={() => setIncoming([...incoming, { qty: i.suggest || '', eta: addDays(asOf, i.lead), expiry: '' }])}><Plus size={13} /> הוספת משלוח בדרך</button>
        </section>

        <section className="glass p-3">
          <h4 className="panel-title mb-2"><Megaphone size={14} className="text-phantom" /> מבצעים – תוספת מכר (תיבות)</h4>
          <p className="mb-2 text-[11px] text-slate-500">כמות <b>נוספת</b> מעבר למכר הרגיל, כמו בקובץ שלכם. החישוב מתעדכן מיד.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {months.map((m) => (
              <label key={m} className="text-center">
                <span className="block text-[11px] text-slate-400">{monthLabel(m)}</span>
                <Input type="number" min="0" value={override.promos?.[m] ?? ''} onChange={(e) => setPromo(m, e.target.value)} className="num text-center" placeholder="0" />
              </label>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function M({ l, v, sub, tone }) {
  return (
    <div className="rounded-lg border border-coal-700 bg-coal-850/70 px-3 py-2">
      <div className="text-[10px] text-slate-500">{l}</div>
      <div className="num text-end text-base font-semibold text-slate-100" style={tone ? { color: tone } : undefined}>{v}</div>
      {sub && <div className="text-end text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
