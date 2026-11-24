import { useState } from 'react';
import { ChevronDown, Copy, Download, Ship, Factory, AlertTriangle } from 'lucide-react';
import { Badge, Table, Empty, copyText, useToast } from '../components/ui.jsx';
import { STATUS, fmt, fmtDate, fmtMoney, diffDays } from '../lib/engine.js';
import { exportXlsx } from '../lib/ingest.js';

export default function OrdersView({ result, settings, onSelect }) {
  const toast = useToast();
  const [open, setOpen] = useState(() => new Set(result.orders.slice(0, 2).map((o) => o.supplier)));
  const toggle = (s) => setOpen((x) => { const n = new Set(x); n.has(s) ? n.delete(s) : n.add(s); return n; });

  if (!result.orders.length) return <Empty>אין כרגע מוצרים שצריך להזמין בתקופה הקרובה 👌</Empty>;

  const text = (o) => [
    `הזמנה – ${o.supplier}`,
    ...o.items.map((i) => `• ${i.name} (${i.sku}) – ${fmt(i.suggest)} תיבות${i.pallets ? ` (${fmt(i.pallets, 1)} משטחים)` : ''}`),
    `סה״כ ${fmt(o.cases)} תיבות${o.pallets ? ` · ${fmt(o.pallets, 1)} משטחים` : ''}`,
  ].join('\n');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        מקובץ לפי ספק · כל ההזמנות הדרושות ב-{settings.soonDays} הימים הקרובים · כמות מוצעת מכסה {settings.coverLocalMonths} חודשים (מקומי) / {settings.coverImportMonths} חודשים (יבוא) אחרי ההגעה, מעוגלת למשטחים מלאים ביבוא ומוגבלת לפי חיי מדף.
      </p>
      {result.orders.map((o) => {
        const isOpen = open.has(o.supplier);
        const late = o.orderByDay <= 0;
        return (
          <section key={o.supplier} className={`glass overflow-hidden ${o.urgent ? '!border-critical/50' : ''}`}>
            <button onClick={() => toggle(o.supplier)} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-start hover:bg-white/[0.02]">
              <div className="flex min-w-[220px] flex-1 items-center gap-3">
                {o.isImport ? <Ship size={18} className="text-surge" /> : <Factory size={18} className="text-healthy" />}
                <div>
                  <div className="font-semibold text-white">{o.supplier}</div>
                  <div className="text-[11px] text-slate-500">{o.isImport ? 'יבוא' : 'מקומי'} · {o.items.length} מוצרים</div>
                </div>
              </div>
              <Metric label="להזמין עד" value={late ? 'עכשיו' : fmtDate(o.orderByDate)} sub={late ? null : `בעוד ${diffDays(o.orderByDate, result.asOf)} ימים`} tone={late ? 'text-critical-soft' : 'text-phantom-soft'} />
              <Metric label="תיבות" value={fmt(o.cases)} />
              <Metric label="משטחים" value={o.pallets ? fmt(o.pallets, 1) : '—'} />
              {o.containers && <Metric label="מכולות" value={`${o.containers.n40 ? `${o.containers.n40}×40'` : ''}${o.containers.n40 && o.containers.n20 ? ' + ' : ''}${o.containers.n20 ? "1×20'" : ''}`} sub={`ניצול ${Math.round(o.containers.fill * 100)}%`} tone="text-surge-soft" />}
              {o.value > 0 && <Metric label="שווי (מחירון)" value={fmtMoney(o.value)} />}
              <div className="flex items-center gap-2">
                {o.urgent && <Badge color="#FF3B5C"><AlertTriangle size={11} /> יש חוסר</Badge>}
                <ChevronDown size={18} className={`text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-coal-700">
                <Table head={['מק״ט', 'מוצר', 'סטטוס', { label: 'מלאי שמיש', end: 1 }, { label: 'מכר/חודש', end: 1 }, 'ייגמר', { label: 'Lead', end: 1 }, 'להזמין עד', { label: 'כמות מוצעת', end: 1 }, { label: 'משטחים', end: 1 }]}>
                  {o.items.sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || (a.orderByDay ?? 0) - (b.orderByDay ?? 0)).map((i) => (
                    <tr key={i.sku} onClick={() => onSelect(i.sku)} className="cursor-pointer hover:bg-white/[0.03]">
                      <td className="num px-3 py-2 text-xs text-slate-400">{i.sku}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-slate-100">{i.name}</td>
                      <td className="px-3 py-2"><Badge color={STATUS[i.status].color}>{STATUS[i.status].label}</Badge></td>
                      <td className="num px-3 py-2 text-end">{fmt(i.sellableNow)}</td>
                      <td className="num px-3 py-2 text-end text-slate-400">{fmt(i.f.monthly)}</td>
                      <td className="num px-3 py-2 text-xs" style={{ color: STATUS[i.status].color }}>{fmtDate(i.stockoutDate)}</td>
                      <td className="num px-3 py-2 text-end text-slate-500">{i.lead}</td>
                      <td className="num px-3 py-2 text-xs text-slate-300">{(i.orderByDay ?? 0) <= 0 ? 'עכשיו' : fmtDate(i.orderByDate)}</td>
                      <td className="num px-3 py-2 text-end font-semibold text-phantom-soft">{fmt(i.suggest)}{i.shelfCap != null && i.suggest >= i.shelfCap && <span className="ms-1 text-[10px] text-void-soft" title="הוגבל כדי שלא יפוג לפני שיימכר">⏳</span>}</td>
                      <td className="num px-3 py-2 text-end text-slate-400">{i.pallets ? fmt(i.pallets, 1) : '—'}</td>
                    </tr>
                  ))}
                </Table>
                <div className="flex flex-wrap items-center gap-2 border-t border-coal-700 px-4 py-2.5">
                  <button className="btn text-xs" onClick={() => copyText(text(o)).then(() => toast('ok', 'ההזמנה הועתקה'))}><Copy size={13} /> העתקה לוואטסאפ/מייל</button>
                  <button className="btn text-xs" onClick={() => exportXlsx(`הזמנה-${o.supplier}.xlsx`, { [o.supplier.slice(0, 28)]: o.items.map((i) => ({ 'מק״ט': i.sku, 'מוצר': i.name, 'כמות (תיבות)': i.suggest, 'משטחים': i.pallets ? +i.pallets.toFixed(1) : '' })) })}><Download size={13} /> אקסל לספק</button>
                  {o.missingPallet && <span className="text-[11px] text-slate-500">לחלק מהמוצרים חסר "תיבות במשטח" – לא נכללו בחישוב המשטחים</span>}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Metric({ label, value, sub, tone = 'text-slate-100' }) {
  return (
    <div className="min-w-[80px]">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`num text-base font-semibold ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
