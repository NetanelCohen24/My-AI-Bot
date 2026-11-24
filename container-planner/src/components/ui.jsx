import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, ScanBarcode, AlertTriangle, CheckCircle2, Sun, Moon } from 'lucide-react';

/* ───── Toasts ───── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = (kind, msg) => {
    const id = Math.random();
    setItems((x) => [...x, { id, kind, msg }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'err' ? 7000 : 3500);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 start-4 z-[90] flex max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
            t.kind === 'err' ? 'border-critical/60 bg-critical/15 text-critical-soft' : 'border-healthy/50 bg-healthy/10 text-healthy-soft'}`}>
            {t.kind === 'err' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───── Layout primitives ───── */
export function Panel({ title, icon: Icon, actions, children, className = '', bodyClass = 'p-4', tone = 'text-phantom' }) {
  return (
    <section className={`glass corner flex min-w-0 flex-col ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-coal-700 px-4 py-3">
          <h2 className="panel-title">{Icon && <Icon size={14} className={tone} />}{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Badge({ color, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ background: `${color}22`, color }}>{children}</span>
  );
}

export function Stat({ label, value, sub, tone = 'text-slate-100', icon: Icon, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`glass flex flex-col gap-1 px-4 py-3 text-start ${onClick ? 'transition hover:border-slate-500' : ''}`}>
      <div className="flex items-center gap-2 text-[11px] text-slate-400">{Icon && <Icon size={13} className={tone} />}{label}</div>
      <div className={`num text-2xl font-semibold leading-none text-end ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </Tag>
  );
}

export function Empty({ children }) {
  return <div className="flex h-32 items-center justify-center text-sm text-slate-500">{children}</div>;
}

/* ───── Forms ───── */
export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-slate-500">{hint}</span>}
    </label>
  );
}
export const Input = (p) => <input {...p} className={`select w-full ${p.className || ''}`} />;
export const Select = ({ children, ...p }) => <select {...p} className={`select w-full ${p.className || ''}`}>{children}</select>;

/* ───── Overlays ───── */
function useEsc(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, icon: Icon, children, footer, wide }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={`glass corner flex max-h-[92vh] w-full flex-col overflow-hidden bg-coal-900/95 ${wide ? 'max-w-5xl' : 'max-w-xl'}`}
        onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-center justify-between border-b border-coal-700 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">{Icon && <Icon size={18} className="text-phantom" />}{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-coal-700 hover:text-white" aria-label="סגירה"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-coal-700 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, children, accent = '#F59E0B', width = 'max-w-[640px]' }) {
  useEsc(open, onClose);
  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside role="dialog" aria-modal="true" className={`fixed inset-y-0 end-0 z-50 flex w-full ${width} flex-col border-s border-coal-700 bg-coal-900/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(to left, ${accent}, transparent)` }} />
        {open && children}
      </aside>
    </>
  );
}

/* ───── Product picker with barcode / SKU / name search ───── */
export function ProductPicker({ products, onPick, placeholder = 'סריקת ברקוד / מק״ט / שם מוצר…', autoFocus, exclude = [] }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter((p) => !exclude.includes(p.id) && `${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, products, exclude]);
  const pick = (p) => { onPick(p); setQ(''); setOpen(false); ref.current?.focus(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      // Scanner sends the barcode + Enter: exact match wins.
      const exact = products.find((p) => p.barcode === q.trim() || p.sku.toLowerCase() === q.trim().toLowerCase());
      if (exact) pick(exact); else if (list[hi]) pick(list[hi]);
    }
  };
  return (
    <div className="relative">
      <ScanBarcode size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-phantom/70" />
      <input ref={ref} autoFocus={autoFocus} value={q} placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
        className="select w-full ps-8" />
      {open && list.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-coal-700 bg-coal-900 p-1 shadow-2xl">
          {list.map((p, i) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-sm ${i === hi ? 'bg-phantom/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                <span className="truncate">{p.name}</span>
                <span className="num shrink-0 text-[11px] text-slate-500">{p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'חיפוש…', className = 'w-60' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="select w-full ps-8" />
    </div>
  );
}

/* Table wrapper with consistent look */
export function Table({ head, children, className = '' }) {
  return (
    <div className={`overflow-auto ${className}`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-coal-850/95 text-[11px] text-slate-400 backdrop-blur">
          <tr>{head.map((h, i) => <th key={i} className={`whitespace-nowrap px-3 py-2 font-medium ${h.end ? 'text-end' : 'text-start'}`}>{h.label ?? h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-coal-700/60">{children}</tbody>
      </table>
    </div>
  );
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => fallback(text));
  fallback(text);
  return Promise.resolve();
}
function fallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
}

/* ───── Theme (dark / light) ───── */
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F4F6FA' : '#0B0F19');
    try { localStorage.setItem('cp.theme', theme); } catch { /* private mode */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))];
}

export function ThemeToggle({ withLabel }) {
  const [theme, toggle] = useTheme();
  const light = theme === 'light';
  return (
    <button onClick={toggle} className="btn !px-2.5 !py-1.5 text-xs" aria-label={light ? 'מעבר למצב כהה' : 'מעבר למצב בהיר'} title={light ? 'מצב כהה' : 'מצב בהיר'}>
      {light ? <Moon size={15} /> : <Sun size={15} />}
      {withLabel && (light ? 'מצב כהה' : 'מצב בהיר')}
    </button>
  );
}
