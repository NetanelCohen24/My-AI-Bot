import { useMemo, useState } from 'react';
import { Ghost, Grid3x3 } from 'lucide-react';
import { STATUS, fmtN, fmtZ, isAlert } from '../lib/engine.js';

const CELL = {
  phantom: 'bg-phantom/25 border-phantom/70 text-phantom-soft shadow-glowAmber',
  critical: 'bg-critical/30 border-critical/80 text-white shadow-glowRed animate-flicker',
  oos: 'bg-void/20 border-void/60 text-void-soft',
  drop: 'bg-rose-500/15 border-rose-400/50 text-rose-300',
  spike: 'bg-surge/15 border-surge/50 text-surge-soft',
  ok: 'border-healthy/10 text-healthy/60',
  idle: 'border-dashed border-coal-700 text-slate-600',
};

function okShade(z) {
  // Healthy cells: subtle emerald whose intensity follows |z| (closer to 0 = calmer).
  const a = Math.max(0.04, 0.16 - Math.min(Math.abs(z), 2) * 0.05);
  return { backgroundColor: `rgba(16,185,129,${a})` };
}

function cellLabel(c) {
  switch (c.status) {
    case 'phantom': return c.zeroStreak;
    case 'oos': return '0';
    case 'idle': return '·';
    case 'ok': return '';
    default: return fmtZ(c.z).replace('σ', '');
  }
}

export default function HeatMatrix({ cells, highlight = [], selectedKey, onSelect, sortMode, setSortMode }) {
  const [hover, setHover] = useState(null);

  const { products, rows } = useMemo(() => {
    const pmap = new Map();
    const smap = new Map();
    for (const c of cells) {
      if (!pmap.has(c.sku)) pmap.set(c.sku, { sku: c.sku, product: c.product, alerts: 0 });
      if (isAlert(c.status)) pmap.get(c.sku).alerts++;
      if (!smap.has(c.store)) smap.set(c.store, { store: c.store, storeName: c.storeName, chain: c.chain, region: c.region, cells: new Map(), score: 0, alerts: 0 });
      const s = smap.get(c.store);
      s.cells.set(c.sku, c);
      s.score += c.severity;
      if (isAlert(c.status)) s.alerts++;
    }
    const products = [...pmap.values()].sort((a, b) => b.alerts - a.alerts || a.product.localeCompare(b.product, 'he'));
    let rows = [...smap.values()];
    if (sortMode === 'severity') rows.sort((a, b) => b.score - a.score);
    else rows.sort((a, b) => a.region.localeCompare(b.region, 'he') || a.chain.localeCompare(b.chain, 'he') || a.store.localeCompare(b.store));
    return { products, rows };
  }, [cells, sortMode]);

  if (!rows.length) {
    return (
      <div className="glass flex h-64 items-center justify-center text-sm text-slate-500">אין תאים תואמים לסינון הנוכחי</div>
    );
  }

  let lastRegion = null;
  const short = (p) => p.replace(/\s\d.*$/, '').slice(0, 14);

  return (
    <section className="glass corner relative flex min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-coal-700 px-4 py-3">
        <h2 className="panel-title"><Grid3x3 size={14} className="text-phantom" /> מטריצת סניפים × מוצרים</h2>
        <div className="flex items-center gap-3">
          <Legend />
          <div className="flex overflow-hidden rounded-lg border border-coal-700 text-xs">
            {[['region', 'לפי אזור'], ['severity', 'לפי חומרה']].map(([k, l]) => (
              <button key={k} onClick={() => setSortMode(k)}
                className={`px-2.5 py-1 transition ${sortMode === k ? 'bg-phantom/15 text-phantom-soft' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="relative overflow-auto p-3" style={{ maxHeight: 'calc(100vh - 290px)', minHeight: 360 }}>
        <table className="border-separate" style={{ borderSpacing: 3 }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky start-0 z-30 bg-coal-850/95 px-2 text-start align-bottom text-[10px] font-medium text-slate-500 backdrop-blur">
                סניף / מוצר
              </th>
              {products.map((p) => (
                <th key={p.sku} className="bg-coal-850/95 px-0.5 pb-1 align-bottom backdrop-blur" title={`${p.product} · ${p.sku}`}>
                  <div className="flex w-[62px] flex-col items-center gap-0.5">
                    <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-slate-300">{short(p.product)}</span>
                    <span className="num text-[9px] text-slate-600">…{p.sku.slice(-5)}</span>
                    <span className={`num h-1 w-full rounded-full ${p.alerts ? 'bg-phantom/60' : 'bg-coal-700'}`} style={{ opacity: p.alerts ? Math.min(1, 0.3 + p.alerts * 0.15) : 1 }} />
                  </div>
                </th>
              ))}
              <th className="bg-coal-850/95 px-1 align-bottom text-[10px] font-medium text-slate-500 backdrop-blur">התראות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const showRegion = sortMode === 'region' && r.region !== lastRegion;
              lastRegion = r.region;
              return [
                showRegion && (
                  <tr key={`g-${r.region}`}>
                    <td colSpan={products.length + 2} className="pt-3">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-phantom/70">
                        <span className="h-px w-4 bg-phantom/40" /> אזור {r.region}
                        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-coal-700" />
                      </div>
                    </td>
                  </tr>
                ),
                <tr key={r.store} className="group">
                  <th className="sticky start-0 z-10 bg-coal-850/95 pe-3 ps-1 text-start font-normal backdrop-blur">
                    <div className="flex w-[180px] items-center gap-2">
                      <span className="num rounded border border-coal-700 bg-coal-900 px-1.5 py-0.5 text-[11px] text-slate-300">{r.store}</span>
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[12px] text-slate-200 group-hover:text-white">{r.storeName || '—'}</div>
                        <div className="truncate text-[10px] text-slate-500">{r.chain}</div>
                      </div>
                    </div>
                  </th>
                  {products.map((p) => {
                    const c = r.cells.get(p.sku);
                    if (!c) return <td key={p.sku}><div className="h-9 w-[62px] rounded-md border border-dashed border-coal-800" /></td>;
                    const sel = selectedKey === c.key;
                    const dim = highlight.length > 0 && !highlight.includes(c.status);
                    return (
                      <td key={p.sku}>
                        <button
                          onClick={() => onSelect(c.key)}
                          onMouseEnter={(e) => setHover({ c, rect: e.currentTarget.getBoundingClientRect() })}
                          onMouseLeave={() => setHover(null)}
                          aria-label={`${r.storeName} – ${c.product}: ${STATUS[c.status].label}`}
                          className={`num relative flex h-9 w-[62px] items-center justify-center rounded-md border text-[11px] font-semibold transition hover:scale-[1.08] hover:z-10 ${CELL[c.status]} ${sel ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-coal' : ''} ${dim ? 'opacity-20 saturate-0' : ''}`}
                          style={c.status === 'ok' ? okShade(c.z) : undefined}
                        >
                          {c.status === 'phantom' && <Ghost size={11} className="me-0.5 opacity-80" />}
                          {cellLabel(c)}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-1 text-center">
                    <span className={`num text-xs ${r.alerts ? 'text-phantom-soft' : 'text-slate-600'}`}>{r.alerts || '–'}</span>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {hover && <HoverCard {...hover} />}
    </section>
  );
}

function Legend() {
  const items = ['phantom', 'critical', 'oos', 'drop', 'spike', 'ok'];
  return (
    <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 lg:flex">
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS[s].color, opacity: s === 'ok' ? 0.5 : 0.9 }} />
          {STATUS[s].short}
        </span>
      ))}
    </div>
  );
}

function HoverCard({ c, rect }) {
  const W = 250;
  // RTL: prefer opening toward the left of the cell; flip if no room.
  let left = rect.left - W - 10;
  if (left < 8) left = rect.right + 10;
  const top = Math.min(rect.top - 8, window.innerHeight - 200);
  const st = STATUS[c.status];
  return (
    <div className="glass pointer-events-none fixed z-50 p-3 text-xs" style={{ left, top, width: W, background: 'rgba(15,20,34,.95)' }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ color: st.color }}>{st.label}</span>
        <span className="num text-slate-500">#{c.store}</span>
      </div>
      <div className="truncate text-slate-200">{c.product}</div>
      <div className="num mb-2 text-[10px] text-slate-500">{c.sku}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-slate-500">מכירה אחרונה</dt><dd className="num text-end">{fmtN(c.lastQty)}</dd>
        <dt className="text-slate-500">צפי (MA28×יום)</dt><dd className="num text-end">{fmtN(c.expected, 1)}</dd>
        <dt className="text-slate-500">Z-Score</dt><dd className="num text-end" style={{ color: Math.abs(c.z) >= 2 ? st.color : undefined }}>{fmtZ(c.z)}</dd>
        <dt className="text-slate-500">מלאי POS</dt><dd className="num text-end">{fmtN(c.invNow)}</dd>
        {c.zeroStreak > 0 && (<><dt className="text-slate-500">ימים ללא מכירה</dt><dd className="num text-end">{c.zeroStreak}</dd></>)}
      </dl>
      <div className="mt-2 border-t border-coal-700 pt-1.5 text-[10px] text-slate-500">לחיצה לפתיחת ניתוח מגמה</div>
    </div>
  );
}
