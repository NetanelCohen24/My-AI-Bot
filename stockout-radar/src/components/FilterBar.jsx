import { Search, X } from 'lucide-react';
import { STATUS } from '../lib/engine.js';

const STATUS_KEYS = ['phantom', 'critical', 'oos', 'drop', 'spike', 'ok'];

export default function FilterBar({ options, filters, setFilters, counts }) {
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleStatus = (s) =>
    setFilters((f) => ({ ...f, status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s] }));
  const dirty = filters.chain || filters.region || filters.q || filters.status.length || filters.alertsOnly;

  return (
    <div className="glass flex flex-wrap items-center gap-2 px-3 py-2.5">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="חיפוש סניף / מוצר / ברקוד"
          className="select w-56 ps-8"
        />
      </div>
      <select className="select" value={filters.chain} onChange={(e) => set('chain', e.target.value)} aria-label="רשת">
        <option value="">כל הרשתות</option>
        {options.chains.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className="select" value={filters.region} onChange={(e) => set('region', e.target.value)} aria-label="אזור">
        <option value="">כל האזורים</option>
        {options.regions.map((c) => <option key={c}>{c}</option>)}
      </select>
      <span className="mx-1 h-5 w-px bg-coal-700" />
      <div className="flex flex-wrap gap-1.5">
        {STATUS_KEYS.map((s) => {
          const on = filters.status.includes(s);
          const st = STATUS[s];
          return (
            <button key={s} onClick={() => toggleStatus(s)} className="chip"
              style={on ? { borderColor: st.color, background: st.color + '22', color: st.color } : undefined}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
              {st.short}
              <span className="num text-[10px] opacity-70">{counts[s] ?? 0}</span>
            </button>
          );
        })}
      </div>
      <label className="ms-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
        <input type="checkbox" className="accent-amber-500" checked={filters.alertsOnly} onChange={(e) => set('alertsOnly', e.target.checked)} />
        רק סניפים עם התראות
      </label>
      {dirty && (
        <button onClick={() => setFilters({ chain: '', region: '', q: '', status: [], alertsOnly: false })}
          className="ms-auto flex items-center gap-1 text-xs text-slate-400 hover:text-white">
          <X size={13} /> ניקוי
        </button>
      )}
    </div>
  );
}
