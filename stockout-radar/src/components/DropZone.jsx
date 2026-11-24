import { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Sparkles, Download } from 'lucide-react';
import { FIELD_LABELS } from '../lib/parser.js';

export function RadarSweep({ size = 220 }) {
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-0 rounded-full border border-phantom/25" />
      <div className="absolute inset-[18%] rounded-full border border-phantom/20" />
      <div className="absolute inset-[36%] rounded-full border border-phantom/15" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-phantom/15" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-phantom/15" />
      <div
        className="absolute inset-0 animate-sweep rounded-full"
        style={{ background: 'conic-gradient(from 0deg, rgba(245,158,11,.45), rgba(245,158,11,0) 70deg, transparent 360deg)' }}
      />
      <span className="absolute left-[64%] top-[28%] h-2 w-2 rounded-full bg-critical shadow-glowRed" />
      <span className="absolute left-[64%] top-[28%] h-2 w-2 animate-ping2 rounded-full bg-critical" />
      <span className="absolute left-[30%] top-[62%] h-1.5 w-1.5 rounded-full bg-phantom shadow-glowAmber" />
      <span className="absolute left-[72%] top-[70%] h-1.5 w-1.5 rounded-full bg-healthy" />
    </div>
  );
}

export default function DropZone({ onFiles, onDemo, onDownloadDemo, busy, compact }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const pick = (list) => list?.length && onFiles([...list]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
      className={`glass corner relative flex flex-col items-center gap-6 overflow-hidden text-center transition ${
        compact ? 'p-6' : 'px-6 py-12 md:flex-row md:justify-center md:gap-14 md:text-start'
      } ${over ? 'border-phantom bg-phantom/5 shadow-glowAmber' : ''}`}
    >
      {!compact && <RadarSweep />}
      <div className="flex max-w-xl flex-col items-center gap-4 md:items-start">
        {!compact && (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-phantom/80">Tactical Inventory Intelligence</span>
            <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">
              זיהוי <span className="text-phantom">מלאי רפאים</span> וחריגות מכירה<br />לפני שהמדף מתרוקן
            </h1>
            <p className="text-sm leading-relaxed text-slate-400">
              גררו לכאן קבצי מכירות ומלאי יומיים (CSV / Excel). העיבוד מתבצע כולו בדפדפן — הנתונים לא עוזבים את המחשב.
            </p>
          </>
        )}
        <button
          onClick={() => input.current?.click()}
          className={`group flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-6 transition ${
            over ? 'border-phantom text-phantom' : 'border-coal-600 text-slate-400 hover:border-phantom/60 hover:text-slate-200'
          }`}
        >
          <UploadCloud size={30} className="transition group-hover:-translate-y-0.5" />
          <span className="text-sm font-medium">{busy ? 'מעבד קבצים…' : 'גררו קבצים לכאן או לחצו לבחירה'}</span>
          <span className="num text-[11px] text-slate-500">.csv · .xlsx · .xls — ניתן לבחור כמה ימים יחד</span>
        </button>
        <input ref={input} type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,text/csv" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={onDemo} className="btn btn-primary"><Sparkles size={15} /> טען נתוני דמו</button>
          <button onClick={onDownloadDemo} className="btn text-xs"><Download size={14} /> הורד קובץ דמו (CSV)</button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-slate-500 md:justify-start">
          <FileSpreadsheet size={13} />
          עמודות מזוהות אוטומטית:
          {Object.values(FIELD_LABELS).map((l) => (
            <span key={l} className="rounded border border-coal-700 px-1.5 py-0.5 text-slate-400">{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
