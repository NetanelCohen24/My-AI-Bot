import { useState } from 'react';
import { Database, Cloud, HardDrive, Download, Upload, Sparkles, RotateCcw, LogOut, ShieldCheck } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Field, Input, Badge, useToast } from '../components/ui.jsx';
import { getSupabaseConfig, setSupabaseConfig, emptyDb } from '../lib/backend.js';
import { generateDemo } from '../lib/mock.js';

export default function Settings({ onSignOut }) {
  const { be, db, reload } = useData();
  const toast = useToast();
  const cfg = getSupabaseConfig();
  const [url, setUrl] = useState(cfg?.source === 'local' ? cfg.url : '');
  const [key, setKey] = useState(cfg?.source === 'local' ? cfg.key : '');

  const backup = () => {
    const blob = new Blob([JSON.stringify({ app: 'depot', version: 1, exported_at: new Date().toISOString(), data: db })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `depot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const restore = async (file) => {
    try {
      const j = JSON.parse(await file.text());
      if (j.app !== 'depot' || !j.data) throw new Error('קובץ גיבוי לא תקין');
      if (!confirm('השחזור יחליף את כל הנתונים המקומיים. להמשיך?')) return;
      await be.replaceAll(j.data);
      await reload();
      toast('ok', 'הגיבוי שוחזר');
    } catch (e) { toast('err', e.message); }
  };

  const connect = () => {
    if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url.trim())) { toast('err', 'כתובת Supabase צריכה להיות בפורמט https://xxxx.supabase.co'); return; }
    setSupabaseConfig({ url: url.trim().replace(/\/$/, ''), key: key.trim() });
    location.reload();
  };

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="הגדרות" />
      <Panel title="מסד נתונים" icon={Database}>
        <div className="mb-4 flex items-center gap-3">
          {be.kind === 'supabase' ? <Cloud className="text-healthy" /> : <HardDrive className="text-phantom" />}
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              {be.kind === 'supabase' ? 'מחובר למסד נתונים משותף (Supabase)' : 'מצב מקומי – הנתונים נשמרים בדפדפן זה בלבד'}
              <Badge color={be.kind === 'supabase' ? '#10B981' : '#F59E0B'}>{be.kind === 'supabase' ? 'רב-משתמשים' : 'משתמש יחיד'}</Badge>
            </div>
            <div className="text-xs text-slate-400">{be.kind === 'supabase' ? `מחובר כ-${be.user?.email} · שינויים של משתמשים אחרים מתעדכנים אוטומטית` : 'כדי לעבוד בכמה מכשירים ומשתמשים – חברו Supabase (חינמי). מומלץ לגבות בינתיים.'}</div>
          </div>
          {be.kind === 'supabase' && <button className="btn ms-auto" onClick={onSignOut}><LogOut size={15} /> התנתקות</button>}
        </div>
        {be.kind === 'local' && cfg?.source !== 'env' && (
          <div className="rounded-xl border border-coal-700 bg-coal-850/60 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><ShieldCheck size={15} className="text-healthy" /> חיבור Supabase</h3>
            <ol className="mb-3 list-decimal space-y-1 ps-5 text-xs leading-relaxed text-slate-400">
              <li>צרו פרויקט חינמי ב-supabase.com.</li>
              <li>ב-SQL Editor הריצו את הקובץ <span className="num text-slate-300">depot/supabase/schema.sql</span> מהריפו.</li>
              <li>ב-Authentication → Users צרו משתמש לכל עובד, וכבו הרשמה עצמית (Sign-ups).</li>
              <li>הדביקו כאן את Project URL ואת ה-anon public key (מ-Project Settings → API).</li>
            </ol>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Project URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" className="num" dir="ltr" /></Field>
              <Field label="anon public key"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" className="num" dir="ltr" /></Field>
            </div>
            <button className="btn btn-primary mt-3" disabled={!url || !key} onClick={connect}><Cloud size={15} /> התחברות</button>
          </div>
        )}
        {cfg?.source === 'local' && be.kind === 'supabase' && (
          <button className="btn mt-2 text-xs" onClick={() => { setSupabaseConfig(null); location.reload(); }}>ניתוק החיבור (חזרה למצב מקומי)</button>
        )}
      </Panel>

      <Panel title="גיבוי ונתוני דמו" icon={Download} tone="text-surge">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={backup}><Download size={15} /> הורדת גיבוי (JSON)</button>
          {be.kind === 'local' && (
            <>
              <label className="btn cursor-pointer"><Upload size={15} /> שחזור מגיבוי<input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files[0] && restore(e.target.files[0])} /></label>
              <button className="btn btn-amber" onClick={async () => { if (!confirm('לטעון נתוני דמו? הנתונים הנוכחיים יוחלפו.')) return; await be.replaceAll(generateDemo()); await reload(); toast('ok', 'נתוני דמו נטענו'); }}><Sparkles size={15} /> טעינת נתוני דמו</button>
              <button className="btn text-critical-soft" onClick={async () => { if (!confirm('למחוק את כל הנתונים ולהתחיל מאפס?')) return; await be.replaceAll(emptyDb()); await reload(); toast('ok', 'הנתונים נמחקו'); }}><RotateCcw size={15} /> התחלה מאפס</button>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
