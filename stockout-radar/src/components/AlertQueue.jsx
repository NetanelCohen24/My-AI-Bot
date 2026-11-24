import { Radar } from 'lucide-react';
import { STATUS, fmtN, fmtZ, isAlert } from '../lib/engine.js';

function metric(c) {
  if (c.status === 'phantom') return <><span className="num">{c.zeroStreak}</span> ימים · <span className="num">{fmtN(c.invNow)}</span> יח׳</>;
  if (c.status === 'oos') return <>מלאי <span className="num">0</span> · <span className="num">{c.zeroStreak}</span> ימים</>;
  return <><span className="num">{fmtN(c.lastQty)}</span> מול <span className="num">{fmtN(c.expected, 0)}</span></>;
}

export default function AlertQueue({ cells, selectedKey, onSelect }) {
  const alerts = cells.filter((c) => isAlert(c.status)).sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || b.severity - a.severity);
  return (
    <aside className="glass corner flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-coal-700 px-4 py-3">
        <h2 className="panel-title"><Radar size={14} className="text-critical" /> תור התראות</h2>
        <span className="num rounded-full bg-critical/15 px-2 py-0.5 text-[11px] text-critical-soft">{alerts.length}</span>
      </header>
      <ol className="flex-1 space-y-1.5 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 290px)', minHeight: 360 }}>
        {alerts.length === 0 && <li className="p-6 text-center text-sm text-slate-500">אין התראות פתוחות 🎯</li>}
        {alerts.map((c, i) => {
          const st = STATUS[c.status];
          const sel = c.key === selectedKey;
          return (
            <li key={c.key}>
              <button
                onClick={() => onSelect(c.key)}
                className={`group flex w-full items-stretch gap-3 rounded-lg border p-2.5 text-start transition ${
                  sel ? 'border-slate-400 bg-white/[0.06]' : 'border-transparent hover:border-coal-700 hover:bg-white/[0.03]'
                }`}
              >
                <span className="w-1 shrink-0 rounded-full" style={{ background: st.color, boxShadow: `0 0 10px ${st.color}80` }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: st.color }}>{st.label}</span>
                    <span className="num text-[10px] text-slate-600">#{String(i + 1).padStart(2, '0')}</span>
                  </span>
                  <span className="block truncate text-[13px] text-slate-100">{c.product}</span>
                  <span className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate">{c.storeName} <span className="num text-slate-500">#{c.store}</span></span>
                    <span className="shrink-0 text-slate-300">{metric(c)}</span>
                  </span>
                  {c.status !== 'phantom' && c.status !== 'oos' && (
                    <span className="num mt-0.5 block text-end text-[10px] text-slate-500">Z {fmtZ(c.z)} · Z3 {fmtZ(c.z3)}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
