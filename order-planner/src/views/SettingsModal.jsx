import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Modal, Field, Input, Select } from '../components/ui.jsx';
import { DEFAULTS } from '../lib/engine.js';

const NUM = [
  ['blockDays', 'ימים לחסימה לפני תום תוקף', 'כשאין ערך בקובץ'],
  ['leadDays', 'Lead time ברירת מחדל (ימים)', 'כשאין ערך בקובץ'],
  ['safetyDays', 'מלאי ביטחון (ימי מכר)', 'בנוסף למינימום שהוגדר למוצר'],
  ['coverLocalMonths', 'כיסוי הזמנה – ספק מקומי (חודשים)', 'כמה זמן כל הזמנה אמורה להחזיק'],
  ['coverImportMonths', 'כיסוי הזמנה – יבוא (חודשים)', ''],
  ['soonDays', 'חלון "להזמין בקרוב" (ימים)', ''],
  ['palletsPer20', "משטחים במכולה 20'", ''],
  ['palletsPer40', "משטחים במכולה 40'", ''],
];

export default function SettingsModal({ settings, setSettings, onClose }) {
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  return (
    <Modal open onClose={onClose} title="הגדרות חישוב" icon={SlidersHorizontal}
      footer={<>
        <button className="btn me-auto" onClick={() => setSettings({ ...DEFAULTS })}><RotateCcw size={14} /> ברירות מחדל</button>
        <button className="btn btn-primary" onClick={onClose}>סגירה</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שיטת חיזוי מכר" className="col-span-2">
          <Select value={settings.method} onChange={(e) => set('method', e.target.value)}>
            <option value="recent">3 חודשים אחרונים, משוקלל (מומלץ – מגיב למגמה)</option>
            <option value="year">ממוצע 12 חודשים (יציב)</option>
            <option value="file">עמודת "מכר ממוצע לחודש" מהקובץ</option>
          </Select>
        </Field>
        {NUM.map(([k, l, h]) => (
          <Field key={k} label={l} hint={h}><Input type="number" step="any" min="0" value={settings[k]} onChange={(e) => set(k, Number(e.target.value))} className="num" /></Field>
        ))}
      </div>
    </Modal>
  );
}
