import { useEffect, useMemo, useState } from 'react';
import { X, Copy, Check, MessageCircle, Mail, ClipboardList } from 'lucide-react';
import { STATUS } from '../lib/engine.js';
import { TASK_TYPES, buildTaskList } from '../lib/tasks.js';

export default function TaskModal({ open, onClose, cells, asOf }) {
  const [groupBy, setGroupBy] = useState('region');
  const [format, setFormat] = useState('whatsapp');
  const [types, setTypes] = useState(['phantom', 'critical', 'oos']);
  const [copied, setCopied] = useState(false);

  const { text, count, groups } = useMemo(
    () => buildTaskList(cells, { groupBy, types, format, asOf }),
    [cells, groupBy, types, format, asOf],
  );

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const toggle = (t) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  const subject = `משימות שטח – Stockout Radar`;
  const body = format === 'email' ? text.split('\n').slice(2).join('\n') : text;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass corner flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden bg-coal-900/95" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="מחולל משימות">
        <header className="flex items-center justify-between border-b border-coal-700 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <ClipboardList size={18} className="text-phantom" /> מחולל משימות לשטח
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-coal-700 hover:text-white" aria-label="סגירה"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[260px_1fr]">
          <div className="space-y-5 border-b border-coal-700 p-5 md:border-b-0 md:border-e">
            <Field label="קיבוץ לפי">
              <Seg value={groupBy} onChange={setGroupBy} options={[['region', 'אזור גאוגרפי'], ['chain', 'רשת']]} />
            </Field>
            <Field label="פורמט">
              <Seg value={format} onChange={setFormat} options={[['whatsapp', 'וואטסאפ'], ['email', 'מייל']]} />
            </Field>
            <Field label="סוגי משימות">
              <div className="space-y-1.5">
                {TASK_TYPES.map((t) => (
                  <label key={t} className="flex cursor-pointer items-center justify-between rounded-lg border border-coal-700 px-3 py-2 text-sm hover:border-slate-500">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" className="accent-amber-500" checked={types.includes(t)} onChange={() => toggle(t)} />
                      <span style={{ color: STATUS[t].color }}>{STATUS[t].label}</span>
                    </span>
                    <span className="num text-xs text-slate-500">{cells.filter((c) => c.status === t).length}</span>
                  </label>
                ))}
              </div>
            </Field>
            <div className="rounded-lg border border-coal-700 bg-coal-850 p-3 text-xs text-slate-400">
              <span className="num text-lg font-semibold text-phantom">{count}</span> משימות ·{' '}
              <span className="num text-slate-200">{groups}</span> קבוצות
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-5">
            <pre className="min-h-[300px] flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-coal-700 bg-black/40 p-4 font-sans text-[13px] leading-relaxed text-slate-200" dir="rtl">
              {text}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={copy} className="btn btn-primary" disabled={!count}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'הועתק ללוח!' : 'העתק ללוח'}
              </button>
              <a className={`btn ${!count ? 'pointer-events-none opacity-40' : ''}`} target="_blank" rel="noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}>
                <MessageCircle size={15} className="text-healthy" /> פתח בוואטסאפ
              </a>
              <a className={`btn ${!count ? 'pointer-events-none opacity-40' : ''}`}
                href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
                <Mail size={15} className="text-surge" /> פתח במייל
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function Seg({ value, onChange, options }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-coal-700 text-sm">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`flex-1 px-3 py-1.5 transition ${value === k ? 'bg-phantom/15 text-phantom-soft' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
      ))}
    </div>
  );
}
