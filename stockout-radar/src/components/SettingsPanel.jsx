import { X, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../lib/engine.js';

const FIELDS = [
  { k: 'invThreshold', label: 'סף מלאי לרפאים (יח׳)', min: 1, max: 60, step: 1, hint: 'מלאי POS מעל ערך זה' },
  { k: 'zeroDays', label: 'ימים רצופים ללא מכירה', min: 3, max: 5, step: 1, hint: 'חלון זיהוי מלאי רפאים' },
  { k: 'zThreshold', label: 'סף Z לחריגה', min: 1.5, max: 3, step: 0.1, hint: 'נפילה / קפיצה מעל Nσ' },
  { k: 'zCritical', label: 'סף Z קריטי', min: 2.5, max: 5, step: 0.1, hint: 'נפילה חדה במיוחד' },
  { k: 'minConfidence', label: 'ודאות מינימלית לרפאים', min: 0.9, max: 0.999, step: 0.001, hint: 'מגן על מוצרים איטיים (פואסון)', pct: true },
];

export default function SettingsPanel({ open, onClose, settings, setSettings }) {
  return (
    <div aria-hidden={!open} className={`absolute end-0 top-full z-40 mt-2 w-80 origin-top-left transition ${open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'}`}>
      <div className="glass bg-coal-900/95 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="panel-title"><SlidersHorizontal size={14} className="text-phantom" /> ספי זיהוי</h3>
          <div className="flex items-center gap-1">
            <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="rounded p-1 text-slate-500 hover:text-white" title="איפוס"><RotateCcw size={14} /></button>
            <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-white" aria-label="סגירה"><X size={15} /></button>
          </div>
        </div>
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <label key={f.k} className="block">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">{f.label}</span>
                <span className="num text-phantom-soft">{f.pct ? `${(settings[f.k] * 100).toFixed(1)}%` : settings[f.k]}</span>
              </div>
              <input
                type="range" min={f.min} max={f.max} step={f.step} value={settings[f.k]}
                onChange={(e) => setSettings((s) => ({ ...s, [f.k]: Number(e.target.value) }))}
                className="w-full accent-amber-500"
              />
              <div className="text-[10px] text-slate-500">{f.hint}</div>
            </label>
          ))}
          <div className="rounded-lg border border-coal-700 bg-coal-850 p-2.5 text-[11px] leading-relaxed text-slate-400">
            חלון ממוצע נע: <span className="num text-slate-200">{settings.maWindow}</span> יום. Z מחושב מול צפי עונתי
            (MA28 × מקדם יום-בשבוע) וסטיית תקן של השארית.
          </div>
        </div>
      </div>
    </div>
  );
}
