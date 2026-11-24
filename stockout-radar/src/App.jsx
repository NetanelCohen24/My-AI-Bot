import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, SlidersHorizontal, Upload, Sparkles, X, Database, AlertTriangle, Power } from 'lucide-react';
import { analyze, DEFAULT_SETTINGS, isAlert } from './lib/engine.js';
import { generateMock, rowsToCsv } from './lib/mockData.js';
import { parseFile, mergeRows } from './lib/parser.js';
import { longDate } from './lib/dates.js';
import PulseStrip from './components/PulseStrip.jsx';
import HeatMatrix from './components/HeatMatrix.jsx';
import AlertQueue from './components/AlertQueue.jsx';
import CellDrawer from './components/CellDrawer.jsx';
import FilterBar from './components/FilterBar.jsx';
import DropZone, { RadarSweep } from './components/DropZone.jsx';
import TaskModal from './components/TaskModal.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';

const EMPTY_FILTERS = { chain: '', region: '', q: '', status: [], alertsOnly: false };

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('sr.settings') || '{}') }; } catch { return DEFAULT_SETTINGS; }
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState(null);
  const [settings, setSettings] = useState(loadSettings);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedKey, setSelectedKey] = useState(null);
  const [sortMode, setSortMode] = useState('region');
  const [tasksOpen, setTasksOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => { try { localStorage.setItem('sr.settings', JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);

  const result = useMemo(() => (rows.length ? analyze(rows, settings) : null), [rows, settings]);

  const notify = (kind, msg) => { setToast({ kind, msg, id: Date.now() }); };
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const loadDemo = () => {
    const data = generateMock();
    setRows(data);
    setSource({ kind: 'demo', label: 'נתוני דמו', files: 1, rows: data.length });
    setFilters(EMPTY_FILTERS);
    setSelectedKey(null);
    setUploadOpen(false);
    notify('ok', `נטענו ${data.length.toLocaleString()} שורות דמו עם 20 תרחישי קיצון מובנים`);
  };

  const downloadDemo = () => {
    const blob = new Blob([rowsToCsv(generateMock())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stockout-radar-demo.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleFiles = useCallback(async (files) => {
    setBusy(true);
    try {
      const results = await Promise.all(files.map(parseFile));
      const issues = results.flatMap((r) => r.issues);
      const fresh = results.flatMap((r) => r.rows);
      if (!fresh.length) { notify('err', issues.join(' · ') || 'לא נמצאו שורות תקינות'); return; }
      // Append to existing uploaded data (daily files accumulate); demo data is replaced.
      setRows((prev) => (source?.kind === 'upload' ? mergeRows(prev, fresh) : fresh));
      setSource((s) => ({
        kind: 'upload',
        label: files.length === 1 ? files[0].name : `${files.length} קבצים`,
        files: (s?.kind === 'upload' ? s.files : 0) + files.length,
        rows: fresh.length,
      }));
      setSelectedKey(null);
      setUploadOpen(false);
      notify(issues.length ? 'warn' : 'ok', `נקלטו ${fresh.length.toLocaleString()} שורות${issues.length ? ' · ' + issues.join(' · ') : ''}`);
    } catch (e) {
      notify('err', `שגיאה בקריאת הקובץ: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [source]);

  // Global drag & drop once data is loaded.
  useEffect(() => {
    const enter = (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth.current++; setDragging(true); } };
    const leave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
    const over = (e) => e.preventDefault();
    const drop = (e) => {
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      if (result && e.dataTransfer?.files?.length) handleFiles([...e.dataTransfer.files]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [result, handleFiles]);

  const options = useMemo(() => {
    if (!result) return { chains: [], regions: [] };
    return {
      chains: [...new Set(result.cells.map((c) => c.chain))].sort((a, b) => a.localeCompare(b, 'he')),
      regions: [...new Set(result.cells.map((c) => c.region))].sort((a, b) => a.localeCompare(b, 'he')),
    };
  }, [result]);

  // Scope = chain/region/search. Status filter then narrows stores and highlights cells.
  const scoped = useMemo(() => {
    if (!result) return [];
    const q = filters.q.trim().toLowerCase();
    return result.cells.filter((c) =>
      (!filters.chain || c.chain === filters.chain) &&
      (!filters.region || c.region === filters.region) &&
      (!q || `${c.store} ${c.storeName} ${c.product} ${c.sku} ${c.chain}`.toLowerCase().includes(q)));
  }, [result, filters.chain, filters.region, filters.q]);

  const counts = useMemo(() => scoped.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] || 0) + 1 }), {}), [scoped]);

  const visible = useMemo(() => {
    let keepStores = null;
    if (filters.status.length) keepStores = new Set(scoped.filter((c) => filters.status.includes(c.status)).map((c) => c.store));
    else if (filters.alertsOnly) keepStores = new Set(scoped.filter((c) => isAlert(c.status)).map((c) => c.store));
    return keepStores ? scoped.filter((c) => keepStores.has(c.store)) : scoped;
  }, [scoped, filters.status, filters.alertsOnly]);

  const queueCells = useMemo(
    () => (filters.status.length ? visible.filter((c) => filters.status.includes(c.status)) : visible),
    [visible, filters.status],
  );

  const selected = result?.cells.find((c) => c.key === selectedKey) || null;
  const closeDrawer = useCallback(() => setSelectedKey(null), []);

  const onStatusClick = (s) => setFilters((f) => ({ ...f, status: f.status.length === 1 && f.status[0] === s ? [] : [s] }));

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-[1720px] flex-col gap-4 px-4 py-4 md:px-6">
      {/* ─── Command header ─── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-phantom/40 bg-coal-850">
            <div className="absolute inset-1 animate-sweep rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(245,158,11,.55), transparent 80deg)' }} />
            <div className="relative h-2 w-2 rounded-full bg-phantom shadow-glowAmber" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Stockout Radar</h1>
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-phantom/70">Command Center</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              {result ? (
                <>
                  <span className="flex items-center gap-1 text-healthy"><span className="h-1.5 w-1.5 animate-flicker rounded-full bg-healthy" /> LIVE</span>
                  <span>·</span>
                  <Database size={11} /> <span className="max-w-[180px] truncate">{source?.label}</span>
                  <span>·</span>
                  נכון ל-<span className="num text-slate-300">{longDate(result.asOf)}</span>
                  <span>·</span>
                  <span className="num">{result.kpis.days}</span> ימים
                </>
              ) : (
                <span className="flex items-center gap-1"><Power size={11} /> ממתין לנתונים</span>
              )}
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          {result && (
            <>
              <button className="btn" onClick={() => setUploadOpen(true)}><Upload size={15} /> העלאת קבצים</button>
              <button className="btn" onClick={loadDemo}><Sparkles size={15} /> דמו</button>
              <button className={`btn ${settingsOpen ? 'border-phantom/60' : ''}`} onClick={() => setSettingsOpen((o) => !o)}>
                <SlidersHorizontal size={15} /> ספים
              </button>
              <button className="btn btn-primary" onClick={() => setTasksOpen(true)}>
                <ClipboardList size={15} /> צור משימות לשטח
              </button>
              <button className="btn px-2" title="ניקוי נתונים" onClick={() => { setRows([]); setSource(null); setSelectedKey(null); }}><X size={15} /></button>
            </>
          )}
          <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} setSettings={setSettings} />
        </div>
      </header>

      {!result ? (
        <main className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-5xl">
            <DropZone onFiles={handleFiles} onDemo={loadDemo} onDownloadDemo={downloadDemo} busy={busy} />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ['מלאי רפאים', 'מלאי POS מעל הסף, אפס מכירות 3–5 ימים, למרות ממוצע חיובי ב-28 הימים שקדמו.', 'text-phantom'],
                ['זיהוי חריגות', 'Z-Score מול ממוצע נע 28 יום מנוכה עונתיות שבועית — נפילות חדות וזינוקי ביקוש.', 'text-critical'],
                ['משימות לשטח', 'רשימת פעולה מקובצת לפי אזור או רשת, מוכנה להדבקה בוואטסאפ או במייל.', 'text-healthy'],
              ].map(([t, d, c]) => (
                <div key={t} className="glass p-4">
                  <div className={`mb-1 text-sm font-semibold ${c}`}>{t}</div>
                  <p className="text-xs leading-relaxed text-slate-400">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <main className="flex flex-col gap-4">
          <PulseStrip kpis={result.kpis} onStatusClick={onStatusClick} statusFilter={filters.status} />
          <FilterBar options={options} filters={filters} setFilters={setFilters} counts={counts} />
          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <HeatMatrix
              cells={visible}
              highlight={filters.status}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              sortMode={sortMode}
              setSortMode={setSortMode}
            />
            <AlertQueue cells={queueCells} selectedKey={selectedKey} onSelect={setSelectedKey} />
          </div>
          <footer className="pb-2 text-center text-[10px] text-slate-600">
            עיבוד מקומי בדפדפן · MA{settings.maWindow} · Z≥{settings.zThreshold} · רפאים: מלאי &gt; {settings.invThreshold} ו-{settings.zeroDays}+ ימי אפס
          </footer>
        </main>
      )}

      <CellDrawer
        cell={selected}
        series={selected ? result.seriesByKey.get(selected.key) : null}
        days={result?.days || []}
        settings={settings}
        onClose={closeDrawer}
      />
      {result && <TaskModal open={tasksOpen} onClose={() => setTasksOpen(false)} cells={result.cells} asOf={result.asOf} />}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setUploadOpen(false)}>
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <DropZone compact onFiles={handleFiles} onDemo={loadDemo} onDownloadDemo={downloadDemo} busy={busy} />
            <p className="mt-2 text-center text-[11px] text-slate-500">קבצים חדשים מצטרפים לנתונים הקיימים (כפילויות תאריך+סניף+ברקוד מתעדכנות)</p>
          </div>
        </div>
      )}

      {dragging && result && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-coal/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-phantom p-10 text-phantom">
            <RadarSweep size={140} />
            <div className="text-lg font-semibold">שחררו להוספת הקבצים לרדאר</div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className={`fixed bottom-4 start-4 z-[70] flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
          toast.kind === 'err' ? 'border-critical/60 bg-critical/15 text-critical-soft' : toast.kind === 'warn' ? 'border-phantom/60 bg-phantom/10 text-phantom-soft' : 'border-healthy/50 bg-healthy/10 text-healthy-soft'
        }`}>
          {toast.kind !== 'ok' && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ms-2 opacity-60 hover:opacity-100" aria-label="סגירה"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
