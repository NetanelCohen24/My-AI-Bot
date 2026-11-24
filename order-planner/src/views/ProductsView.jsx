import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { Panel, Table, Badge, SearchBox, Select, Empty } from '../components/ui.jsx';
import { STATUS, fmt, fmtDate } from '../lib/engine.js';

const SORTS = {
  urgency: (a, b) => STATUS[a.status].rank - STATUS[b.status].rank || (a.orderByDay ?? 1e9) - (b.orderByDay ?? 1e9),
  cover: (a, b) => a.coverMonths - b.coverMonths,
  sales: (a, b) => b.f.monthly - a.f.monthly,
  risk: (a, b) => b.riskQty - a.riskQty,
};

export default function ProductsView({ result, onSelect, initialStatus }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  const [brand, setBrand] = useState('');
  const [supplier, setSupplier] = useState('');
  const [origin, setOrigin] = useState('');
  const [sort, setSort] = useState('urgency');
  const [hideIdle, setHideIdle] = useState(true);
  useEffect(() => { setStatus(initialStatus || ''); }, [initialStatus]);

  const opts = useMemo(() => ({
    brands: [...new Set(result.items.map((i) => i.brand).filter(Boolean))].sort(),
    suppliers: [...new Set(result.items.map((i) => i.supplier).filter(Boolean))].sort(),
  }), [result.items]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return result.items
      .filter((i) => (!hideIdle || status === 'idle' || i.status !== 'idle'))
      .filter((i) => (!status || i.status === status) && (!brand || i.brand === brand) && (!supplier || i.supplier === supplier))
      .filter((i) => !origin || (origin === 'import' ? i.isImport : !i.isImport))
      .filter((i) => !s || `${i.sku} ${i.name} ${i.barcode || ''}`.toLowerCase().includes(s))
      .sort(SORTS[sort]);
  }, [result.items, q, status, brand, supplier, origin, sort, hideIdle]);

  return (
    <Panel title={`${rows.length} מוצרים`} bodyClass="p-0"
      actions={<>
        <SearchBox value={q} onChange={setQ} placeholder="מק״ט / שם / ברקוד" className="w-52" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-36"><option value="">כל הסטטוסים</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="!w-36"><option value="">כל הספקים</option>{opts.suppliers.map((x) => <option key={x}>{x}</option>)}</Select>
        <Select value={brand} onChange={(e) => setBrand(e.target.value)} className="!w-32"><option value="">כל המותגים</option>{opts.brands.map((x) => <option key={x}>{x}</option>)}</Select>
        <Select value={origin} onChange={(e) => setOrigin(e.target.value)} className="!w-28"><option value="">יבוא+מקומי</option><option value="import">יבוא</option><option value="local">מקומי</option></Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!w-36" title="מיון"><option value="urgency">מיון: דחיפות</option><option value="cover">מיון: חודשי מלאי</option><option value="sales">מיון: מכר</option><option value="risk">מיון: סכנת תוקף</option></Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" className="accent-amber-500" checked={hideIdle} onChange={(e) => setHideIdle(e.target.checked)} />הסתר ללא מכירות</label>
      </>}>
      <Table className="max-h-[calc(100vh-330px)]" head={['מק״ט', 'מוצר', 'ספק', 'סטטוס', { label: 'מלאי שמיש', end: 1 }, { label: 'מכר/חודש', end: 1 }, { label: 'מגמה', end: 1 }, { label: 'חודשי מלאי', end: 1 }, 'ייגמר', 'להזמין עד', { label: 'מוצע', end: 1 }, { label: 'סכנת תוקף', end: 1 }, 'ABC']}>
        {rows.slice(0, 400).map((i) => (
          <tr key={i.sku} onClick={() => onSelect(i.sku)} className="cursor-pointer hover:bg-white/[0.03]">
            <td className="num px-3 py-2 text-xs text-slate-400">{i.sku}</td>
            <td className="max-w-[260px] truncate px-3 py-2 text-slate-100" title={i.name}>{i.name}</td>
            <td className="max-w-[120px] truncate px-3 py-2 text-xs text-slate-400">{i.supplier || '—'}{i.isImport && <span className="ms-1 text-surge-soft">✈</span>}</td>
            <td className="px-3 py-2"><Badge color={STATUS[i.status].color}>{STATUS[i.status].label}</Badge></td>
            <td className="num px-3 py-2 text-end">{fmt(i.sellableNow)}{i.expiredNowQty > 0 && <span className="ms-1 text-[10px] text-critical-soft" title="עבר מועד חסימה">+{fmt(i.expiredNowQty)}</span>}</td>
            <td className="num px-3 py-2 text-end text-slate-300">{fmt(i.f.monthly)}</td>
            <td className={`num px-3 py-2 text-end text-xs ${i.f.trend == null ? 'text-slate-600' : i.f.trend > 0.1 ? 'text-healthy' : i.f.trend < -0.1 ? 'text-critical-soft' : 'text-slate-400'}`}>{i.f.trend == null ? '—' : `${i.f.trend > 0 ? '▲' : '▼'}${Math.abs(Math.round(i.f.trend * 100))}%`}</td>
            <td className="num px-3 py-2 text-end text-slate-300">{i.coverMonths === Infinity ? '—' : fmt(i.coverMonths, 1)}</td>
            <td className="num px-3 py-2 text-xs" style={{ color: STATUS[i.status].color }}>{fmtDate(i.stockoutDate)}</td>
            <td className="num px-3 py-2 text-xs text-slate-300">{i.orderByDay == null ? '—' : i.orderByDay <= 0 ? 'עכשיו' : fmtDate(i.orderByDate)}</td>
            <td className="num px-3 py-2 text-end text-phantom-soft">{i.suggest ? fmt(i.suggest) : '—'}</td>
            <td className="num px-3 py-2 text-end text-void-soft">{i.riskQty >= 1 ? fmt(i.riskQty) : '—'}</td>
            <td className="px-3 py-2 text-xs text-slate-400">{i.abc || ''}</td>
          </tr>
        ))}
      </Table>
      {!rows.length && <Empty>לא נמצאו מוצרים</Empty>}
      {rows.length > 400 && <div className="border-t border-coal-700 p-2 text-center text-[11px] text-slate-500"><ArrowDownUp size={11} className="inline" /> מוצגים 400 הראשונים – צמצמו בעזרת הסינון</div>}
    </Panel>
  );
}
