import { useEffect, useMemo, useState } from 'react';
import {
  Upload, Sparkles, SlidersHorizontal, Download, FileSpreadsheet, PackageX, Siren, ShoppingCart, Clock, CalendarX2,
  ShieldAlert, Boxes, Truck, CalendarClock, List,
} from 'lucide-react';
import { ToastProvider, useToast, ThemeToggle, Stat } from './components/ui.jsx';
import { ingest, readWorkbook, exportXlsx } from './lib/ingest.js';
import { analyzeAll, DEFAULTS, STATUS, fmt, fmtDate, fmtMoney, monthLabel } from './lib/engine.js';
import { sampleSheets, downloadSampleWorkbook } from './lib/sample.js';
import OrdersView from './views/OrdersView.jsx';
import RiskView from './views/RiskView.jsx';
import ProductsView from './views/ProductsView.jsx';
import ProductDrawer from './views/ProductDrawer.jsx';
import SettingsModal from './views/SettingsModal.jsx';

const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / private mode */ } };

export default function App() {
  return <ToastProvider><Main /></ToastProvider>;
}

function Main() {
  const toast = useToast();
  const [data, setData] = useState(() => load('op.data', null));
  const [file, setFile] = useState(() => load('op.file', null));
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...load('op.settings', {}) }));
  const [overrides, setOverrides] = useState(() => load('op.overrides', {}));
  const [tab, setTab] = useState('orders');
  const [sel, setSel] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [productFilter, setProductFilter] = useState(null);

  useEffect(() => save('op.settings', settings), [settings]);
  useEffect(() => save('op.overrides', overrides), [overrides]);

  const result = useMemo(() => (data ? analyzeAll(data, settings, overrides) : null), [data, settings, overrides]);

  const accept = (d, info) => {
    if (!d.products.length) { toast('err', d.issues.join(' ') || 'לא נמצאו מוצרים בקובץ'); return; }
    setData(d); setFile(info);
    save('op.data', d); save('op.file', info);
    setSettings((s) => ({ ...s, asOf: null })); // follow the new file's date
    toast('ok', `נטענו ${d.products.length} מוצרים · ${d.meta.batches} אצוות${d.issues.length ? ' · ' + d.issues.join(' ') : ''}`);
  };

  const onFile = async (f) => {
    setBusy(true);
    try {
      const sheets = await readWorkbook(await f.arrayBuffer());
      accept(ingest(sheets), { name: f.name, at: new Date().toISOString(), demo: false });
    } catch (e) {
      toast('err', `לא הצלחתי לקרוא את הקובץ: ${e.message}`);
    } finally { setBusy(false); }
  };
  const loadDemo = () => accept(ingest(sampleSheets()), { name: 'קובץ דוגמה (נתונים מומצאים)', at: new Date().toISOString(), demo: true });

  useEffect(() => {
    const over = (e) => { e.preventDefault(); if (e.dataTransfer?.types?.includes('Files')) setDrag(true); };
    const leave = (e) => { if (!e.relatedTarget) setDrag(false); };
    const drop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); };
    window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const setOverride = (sku, patch) => setOverrides((o) => ({ ...o, [sku]: { ...(o[sku] || {}), ...patch } }));

  const exportAll = () => exportXlsx(`תכנון-הזמנות-${result.asOf}.xlsx`, {
    'להזמנה': result.orders.flatMap((o) => o.items.map((i) => ({
      'ספק': o.supplier, 'להזמין עד': fmtDate(o.orderByDate), 'מק״ט': i.sku, 'מוצר': i.name, 'סטטוס': STATUS[i.status].label,
      'מלאי שמיש': Math.round(i.sellableNow), 'מכר חודשי צפוי': Math.round(i.f.monthly), 'ייגמר ב': fmtDate(i.stockoutDate),
      'Lead time': i.lead, 'כמות מוצעת (תיבות)': i.suggest, 'משטחים': i.pallets ? +i.pallets.toFixed(1) : '', 'הערה': i.shelfCap != null && i.suggest >= i.shelfCap ? 'מוגבל לפי חיי מדף' : '',
    }))),
    'סכנת תוקף': result.items.flatMap((i) => i.riskBatches.map((b) => ({
      'מק״ט': i.sku, 'מוצר': i.name, 'תוקף': fmtDate(b.expiry), 'נחסם ב': fmtDate(new Date(Date.parse(result.asOf) + b.block * 86400000).toISOString().slice(0, 10)),
      'תיבות שלא יימכרו': Math.round(b.wasted), 'שווי (מחירון)': Math.round(b.wasted * i.unitValue),
    }))),
    'כל המוצרים': result.items.map((i) => ({
      'מק״ט': i.sku, 'מוצר': i.name, 'מותג': i.brand || '', 'ספק': i.supplier || '', 'מקור': i.origin || '', 'ABC': i.abc || '', 'סטטוס': STATUS[i.status].label,
      'מלאי שמיש': Math.round(i.sellableNow), 'עבר חסימה': Math.round(i.expiredNowQty), 'מכר חודשי צפוי': Math.round(i.f.monthly),
      'מגמה %': i.f.trend == null ? '' : Math.round(i.f.trend * 100), 'חודשי מלאי': i.coverMonths === Infinity ? '' : +i.coverMonths.toFixed(1),
      'ייגמר ב': fmtDate(i.stockoutDate), 'להזמין עד': fmtDate(i.orderByDate), 'כמות מוצעת': i.suggest, 'בסכנת תוקף': Math.round(i.riskQty),
    })),
  });

  if (!result) {
    return (
      <Shell>
        <Empty onFile={onFile} onDemo={loadDemo} busy={busy} />
        {drag && <DropOverlay />}
      </Shell>
    );
  }

  const k = result.kpis;
  const selected = sel ? result.items.find((i) => i.sku === sel) : null;
  const goProducts = (status) => { setProductFilter(status); setTab('products'); };

  return (
    <Shell>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Brand />
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn cursor-pointer"><Upload size={15} /> קובץ מעודכן<input type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden" onChange={(e) => { e.target.files[0] && onFile(e.target.files[0]); e.target.value = ''; }} /></label>
          <button className="btn" onClick={exportAll}><Download size={15} /> ייצוא לאקסל</button>
          <button className="btn" onClick={() => setShowSettings(true)}><SlidersHorizontal size={15} /> הגדרות</button>
          <ThemeToggle />
        </div>
      </header>

      <div className="glass flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><FileSpreadsheet size={13} className="text-healthy" /> <span className="max-w-[260px] truncate text-slate-200">{file?.name}</span></span>
        {data.meta.salesEnd && <span>נתוני מכר עד <b className="text-slate-200">{monthLabel(data.meta.salesEnd)}</b></span>}
        <span className="flex items-center gap-1.5">מלאי נכון ל-
          <input type="date" value={result.asOf} onChange={(e) => setSettings((s) => ({ ...s, asOf: e.target.value || null }))} className="select num !px-2 !py-0.5 text-xs" title="תאריך תמונת המלאי – כל החישובים מתחילים ממנו" />
          {settings.asOf && <button className="text-[11px] text-phantom-soft hover:underline" onClick={() => setSettings((s) => ({ ...s, asOf: null }))}>אוטומטי</button>}
        </span>
        <span><b className="num text-slate-200">{k.products}</b> מוצרים · <b className="num text-slate-200">{data.meta.batches}</b> אצוות</span>
        {file?.demo && <span className="rounded-full bg-phantom/15 px-2 py-0.5 text-phantom-soft">מצב דמו – העלו את הקובץ שלכם</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat icon={PackageX} label="אזל מהמלאי" value={k.out} sub="אין מלאי שמיש" tone="text-critical" onClick={() => goProducts('out')} />
        <Stat icon={Siren} label="יחסר" value={k.short} sub="ייגמר לפני שהזמנה תגיע" tone="text-critical" onClick={() => goProducts('short')} />
        <Stat icon={ShoppingCart} label="להזמין עכשיו" value={k.order} sub="עבר מועד ההזמנה" tone="text-phantom" onClick={() => goProducts('order')} />
        <Stat icon={Clock} label="להזמין בקרוב" value={k.soon} sub={`ב-${settings.soonDays} הימים הקרובים`} tone="text-phantom-soft" onClick={() => goProducts('soon')} />
        <Stat icon={CalendarX2} label="סכנת תוקף" value={fmt(k.riskQty)} sub={<><span className="num">{k.riskSkus}</span> מוצרים · <span className="num">{fmtMoney(k.riskValue)}</span></>} tone="text-void" onClick={() => setTab('risk')} />
        <Stat icon={ShieldAlert} label="עבר מועד חסימה" value={fmt(k.expiredQty)} sub={<><span className="num">{k.expiredSkus}</span> מוצרים · תיבות</>} tone="text-critical-soft" onClick={() => setTab('risk')} />
        <Stat icon={Boxes} label="מתחת למינימום" value={k.belowMin} sub="לפי מלאי ביטחון שהוגדר" tone="text-surge" />
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-coal-700">
        {[['orders', 'מה להזמין', Truck, result.orders.length], ['risk', 'סכנת תוקף', CalendarClock, k.riskSkus + k.expiredSkus], ['products', 'כל המוצרים', List, k.products]].map(([id, label, I, n]) => (
          <button key={id} onClick={() => { setTab(id); if (id !== 'products') setProductFilter(null); }}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${tab === id ? 'border-phantom text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <I size={15} />{label}<span className="num rounded-full bg-coal-700 px-1.5 text-[10px] text-slate-300">{n}</span>
          </button>
        ))}
      </nav>

      {tab === 'orders' && <OrdersView result={result} settings={settings} onSelect={setSel} />}
      {tab === 'risk' && <RiskView result={result} onSelect={setSel} />}
      {tab === 'products' && <ProductsView result={result} onSelect={setSel} initialStatus={productFilter} />}

      <ProductDrawer item={selected} result={result} settings={settings} override={selected ? overrides[selected.sku] : null}
        setOverride={setOverride} onClose={() => setSel(null)} />
      {showSettings && <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />}
      {drag && <DropOverlay />}
      <footer className="pb-2 pt-4 text-center text-[10px] text-slate-500">
        העיבוד מתבצע בדפדפן בלבד · הקובץ לא נשלח לשום שרת · הנתונים נשמרים במחשב זה עד להעלאת קובץ חדש
      </footer>
    </Shell>
  );
}

function Shell({ children }) {
  return <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-4 md:px-6">{children}</div>;
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-phantom/40 bg-coal-850"><Truck size={20} className="text-phantom" /></div>
      <div className="leading-tight">
        <h1 className="text-lg font-bold text-white">מתכנן הזמנות ותוקף</h1>
        <div className="text-[11px] text-slate-500">מתי ייגמר · מתי להזמין · כמה · מה בסכנת תוקף</div>
      </div>
    </div>
  );
}

function Empty({ onFile, onDemo, busy }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
      <div className="absolute end-4 top-4"><ThemeToggle withLabel /></div>
      <Brand />
      <label className="glass corner flex w-full max-w-2xl cursor-pointer flex-col items-center gap-3 border-2 border-dashed !border-coal-600 px-6 py-12 text-center transition hover:!border-phantom/60">
        <Upload size={34} className="text-phantom" />
        <span className="text-lg font-semibold text-white">{busy ? 'קורא את הקובץ…' : 'גררו לכאן את קובץ המלאי שלכם'}</span>
        <span className="max-w-md text-sm text-slate-400">אותו קובץ אקסל שאתם עובדים איתו – אין צורך לסדר או להכין. המערכת מזהה לבד את גיליון המלאי לפי אצוות, גיליונות המכר החודשי וגיליון זמני האספקה.</span>
        <span className="btn btn-primary mt-2"><FileSpreadsheet size={15} /> בחירת קובץ</span>
        <input type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      </label>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn" onClick={onDemo}><Sparkles size={15} /> לנסות עם נתוני דוגמה</button>
        <button className="btn" onClick={downloadSampleWorkbook}><Download size={15} /> הורדת קובץ לדוגמה</button>
      </div>
      <div className="grid w-full max-w-4xl gap-3 md:grid-cols-3">
        {[
          ['מתי ייגמר', 'לפי מכר 3 החודשים האחרונים ומגמה, תוך התחשבות בתוקף כל אצווה – מלאי שייחסם לא נספר.', 'text-critical'],
          ['מתי ומה להזמין', 'תאריך הזמנה לפי ה-Lead time של כל מוצר, כמות מוצעת מעוגלת למשטחים, וחלוקה לפי ספק ומכולות.', 'text-phantom'],
          ['סכנת תוקף', 'כמה תיבות לא יספיקו להימכר לפני מועד החסימה – כדי להוציא מבצע או תרומה בזמן.', 'text-void'],
        ].map(([t, d, c]) => (
          <div key={t} className="glass p-4"><div className={`mb-1 text-sm font-semibold ${c}`}>{t}</div><p className="text-xs leading-relaxed text-slate-400">{d}</p></div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">🔒 הקובץ נקרא בדפדפן שלכם בלבד ולא נשלח לשום שרת.</p>
    </div>
  );
}

function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-coal-900/80 backdrop-blur-sm">
      <div className="rounded-2xl border-2 border-dashed border-phantom px-10 py-8 text-lg font-semibold text-phantom-soft"><Upload className="mx-auto mb-2" />שחררו לטעינת הקובץ</div>
    </div>
  );
}

