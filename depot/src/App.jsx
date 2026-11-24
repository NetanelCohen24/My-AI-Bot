import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Boxes, ClipboardList, PackagePlus, ShoppingCart, CalendarClock, ClipboardCheck, History, Store, Factory,
  FileSpreadsheet, Settings as Cog, Menu, X, Cloud, HardDrive, Sparkles, LogIn, Loader2,
} from 'lucide-react';
import { ToastProvider, Field, Input, ThemeToggle } from './components/ui.jsx';
import { DataProvider, useData } from './lib/store.jsx';
import { localBackend, supabaseBackend, getSupabaseConfig, setSupabaseConfig } from './lib/backend.js';
import { generateDemo } from './lib/mock.js';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import Orders from './pages/Orders.jsx';
import Receiving from './pages/Receiving.jsx';
import Purchasing from './pages/Purchasing.jsx';
import Expiry from './pages/Expiry.jsx';
import Count from './pages/Count.jsx';
import Movements from './pages/Movements.jsx';
import Partners from './pages/Partners.jsx';
import Import from './pages/Import.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  ['dashboard', 'לוח בקרה', LayoutDashboard],
  ['inventory', 'מלאי', Boxes],
  ['orders', 'הזמנות לקוחות', ClipboardList],
  ['receiving', 'קליטת סחורה', PackagePlus],
  ['purchasing', 'רכש', ShoppingCart],
  ['expiry', 'תוקף ואצוות', CalendarClock],
  ['count', 'ספירה והחזרות', ClipboardCheck],
  ['movements', 'יומן תנועות', History],
  ['customers', 'לקוחות', Store],
  ['suppliers', 'ספקים', Factory],
  ['import', 'ייבוא מאקסל', FileSpreadsheet],
  ['settings', 'הגדרות', Cog],
];

export default function App() {
  return (
    <ToastProvider>
      <Boot />
    </ToastProvider>
  );
}

/** Pick a backend: Supabase if configured (requires sign-in), else local browser storage. */
function Boot() {
  const [state, setState] = useState({ phase: 'loading' });

  useEffect(() => {
    (async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) { setState({ phase: 'ready', backend: localBackend() }); return; }
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient(cfg.url, cfg.key, { auth: { persistSession: true } });
        const { data } = await client.auth.getSession();
        if (!data.session) { setState({ phase: 'login', client, cfg }); return; }
        setState({ phase: 'ready', backend: await supabaseBackend(client, data.session) });
      } catch (e) {
        setState({ phase: 'error', error: e.message, cfg });
      }
    })();
  }, []);

  if (state.phase === 'loading') return <Splash />;
  if (state.phase === 'error') {
    return (
      <Center>
        <p className="mb-3 text-critical-soft">החיבור למסד הנתונים נכשל: {state.error}</p>
        {state.cfg?.source === 'local' && <button className="btn" onClick={() => { setSupabaseConfig(null); location.reload(); }}>חזרה למצב מקומי</button>}
      </Center>
    );
  }
  if (state.phase === 'login') {
    return <Login client={state.client} onIn={async (session) => setState({ phase: 'ready', backend: await supabaseBackend(state.client, session) })} cfg={state.cfg} />;
  }
  return (
    <DataProvider backend={state.backend}>
      <Shell onSignOut={async () => { await state.backend.signOut(); location.reload(); }} />
    </DataProvider>
  );
}

function Shell({ onSignOut }) {
  const { be, db, loading, reload } = useData();
  const [page, setPage] = useState(() => location.hash.slice(1) || 'dashboard');
  const [menu, setMenu] = useState(false);
  const [receivePo, setReceivePo] = useState(null);

  useEffect(() => {
    const h = () => setPage(location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const go = (p) => { location.hash = p; setMenu(false); window.scrollTo(0, 0); };

  if (loading) return <Splash />;

  const empty = be.kind === 'local' && !db.products.length && !db.customers.length;
  if (empty && page !== 'import' && page !== 'settings') {
    return (
      <Center>
        <Logo big />
        <h1 className="mt-6 text-2xl font-bold text-white">ברוכים הבאים ל-Depot</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">מערכת לניהול מלאי, אצוות ותוקף, הזמנות לקוחות ורכש. איך תרצו להתחיל?</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className="btn btn-primary" onClick={async () => { await be.replaceAll(generateDemo()); await reload(); }}><Sparkles size={15} /> לנסות עם נתוני דמו</button>
          <button className="btn" onClick={() => go('import')}><FileSpreadsheet size={15} /> לייבא מאקסל</button>
          <button className="btn" onClick={() => go('settings')}><Cloud size={15} /> לחבר מסד נתונים משותף</button>
        </div>
      </Center>
    );
  }

  const pages = {
    dashboard: <Dashboard go={go} />,
    inventory: <Inventory />,
    orders: <Orders />,
    receiving: <Receiving initialPo={receivePo} clearInitial={() => setReceivePo(null)} />,
    purchasing: <Purchasing onReceive={(id) => { setReceivePo(id); go('receiving'); }} />,
    expiry: <Expiry />,
    count: <Count />,
    movements: <Movements />,
    customers: <Partners kind="customers" />,
    suppliers: <Partners kind="suppliers" />,
    import: <Import />,
    settings: <Settings onSignOut={onSignOut} />,
  };

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Sidebar — RTL: sits on the right (inline-start). */}
      <aside className={`fixed inset-y-0 start-0 z-40 flex w-60 flex-col border-e border-coal-700 bg-coal-900/95 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menu ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <Logo />
          <button className="rounded p-1 text-slate-400 lg:hidden" onClick={() => setMenu(false)} aria-label="סגירת תפריט"><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV.map(([k, l, I]) => (
            <button key={k} onClick={() => go(k)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${page === k ? 'bg-phantom/15 text-phantom-soft' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}>
              <I size={16} />{l}
            </button>
          ))}
        </nav>
        <div className="border-t border-coal-700 p-3 text-[11px] text-slate-500">
          <div className="mb-2"><ThemeToggle withLabel /></div>
          <div className="flex items-center gap-1.5">
            {be.kind === 'supabase' ? <Cloud size={12} className="text-healthy" /> : <HardDrive size={12} className="text-phantom" />}
            {be.kind === 'supabase' ? 'מסד משותף' : 'מצב מקומי · נשמר בדפדפן זה'}
          </div>
          <div className="truncate">{be.user?.email}</div>
        </div>
      </aside>
      {menu && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMenu(false)} />}

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-coal-700 bg-coal-900/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setMenu(true)} className="rounded p-1 text-slate-300" aria-label="תפריט"><Menu size={20} /></button>
          <Logo />
          <div className="ms-auto"><ThemeToggle /></div>
        </div>
        <main className="mx-auto max-w-[1500px] p-4 md:p-6">{pages[page] || pages.dashboard}</main>
      </div>
    </div>
  );
}

function Login({ client, onIn, cfg }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { data, error } = await client.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'אימייל או סיסמה שגויים' : error.message);
    else onIn(data.session);
  };
  return (
    <Center>
      <form onSubmit={submit} className="glass corner w-full max-w-sm p-6 text-start">
        <Logo big />
        <h1 className="mb-4 mt-5 text-lg font-semibold text-white">כניסה למערכת</h1>
        <div className="space-y-3">
          <Field label="אימייל"><Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></Field>
          <Field label="סיסמה"><Input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
        </div>
        {err && <p className="mt-3 text-sm text-critical-soft">{err}</p>}
        <button className="btn btn-primary mt-5 w-full" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} כניסה</button>
        {cfg?.source === 'local' && <button type="button" className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300" onClick={() => { setSupabaseConfig(null); location.reload(); }}>חזרה למצב מקומי</button>}
      </form>
    </Center>
  );
}

function Logo({ big }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`relative flex items-center justify-center rounded-xl border border-phantom/40 bg-coal-850 ${big ? 'h-12 w-12' : 'h-9 w-9'}`}>
        <Boxes size={big ? 24 : 18} className="text-phantom" />
        <span className="absolute -end-0.5 -top-0.5 h-2 w-2 animate-flicker rounded-full bg-healthy" />
      </div>
      <div className="leading-tight">
        <div className={`font-bold tracking-tight text-white ${big ? 'text-xl' : 'text-base'}`}>Depot</div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.25em] text-phantom/70">Inventory Control</div>
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="absolute end-4 top-4"><ThemeToggle withLabel /></div>
      {children}
    </div>
  );
}
function Splash() {
  return <Center><Loader2 className="animate-spin text-phantom" size={28} /></Center>;
}
