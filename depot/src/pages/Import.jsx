import { useState } from 'react';
import { FileSpreadsheet, UploadCloud, Download, CheckCircle2 } from 'lucide-react';
import { useData } from '../lib/store.jsx';
import { PageHeader, Panel, Table, Badge } from '../components/ui.jsx';
import { IMPORT_KINDS, readSheet, mapColumns, downloadTemplate, toISODate } from '../lib/excel.js';
import { saveEntity } from '../lib/ops.js';

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[,₪\s]/g, '')); return Number.isNaN(n) ? 0 : n; };
const str = (v) => String(v ?? '').trim().replace(/\.0+$/, '');

export default function Import() {
  const { run, busy } = useData();
  const [kind, setKind] = useState('products');
  const [preview, setPreview] = useState(null);
  const [over, setOver] = useState(false);

  const load = async (file) => {
    const raw = await readSheet(file);
    const headers = Object.keys(raw[0] || {});
    const map = mapColumns(kind, headers);
    const missing = IMPORT_KINDS[kind].required.filter((f) => !map[f]);
    const rows = raw.map((r) => Object.fromEntries(Object.entries(map).map(([f, h]) => [f, r[h]]))).filter((r) => IMPORT_KINDS[kind].required.every((f) => str(r[f])));
    setPreview({ file: file.name, map, missing, rows });
  };

  const commit = () => run(async (db, be) => {
    const { rows } = preview;
    let created = 0;
    let updated = 0;
    if (kind === 'suppliers') {
      for (const r of rows) {
        const ex = db.suppliers.find((s) => s.name === str(r.name));
        await saveEntity(be, 'suppliers', { ...(ex || { active: true }), name: str(r.name), phone: str(r.phone) || ex?.phone || '', email: str(r.email) || ex?.email || '', lead_days: num(r.lead_days) || ex?.lead_days || 3 });
        ex ? updated++ : created++;
      }
    } else if (kind === 'customers') {
      for (const r of rows) {
        const ex = db.customers.find((c) => (str(r.code) && c.code === str(r.code)) || c.name === str(r.name));
        const row = { ...(ex || { active: true }) };
        for (const k of ['code', 'name', 'chain', 'city', 'region', 'phone', 'address']) if (str(r[k])) row[k] = str(r[k]);
        await saveEntity(be, 'customers', row);
        ex ? updated++ : created++;
      }
    } else {
      // Products: create/update the catalogue, auto-create unknown suppliers, then post opening stock.
      const suppliers = [...db.suppliers];
      const supId = async (name) => {
        if (!str(name)) return null;
        let s = suppliers.find((x) => x.name === str(name));
        if (!s) { s = await saveEntity(be, 'suppliers', { name: str(name), lead_days: 3, active: true }); suppliers.push(s); }
        return s.id;
      };
      const openings = [];
      const products = [...db.products];
      for (const r of rows) {
        const ex = products.find((p) => p.sku === str(r.sku));
        const row = { ...(ex || { active: true, track_expiry: !!r.expiry, unit: 'יח׳' }), sku: str(r.sku), name: str(r.name) };
        for (const k of ['barcode', 'category', 'unit']) if (str(r[k])) row[k] = str(r[k]);
        for (const k of ['cost', 'price', 'min_qty', 'reorder_qty']) if (str(r[k])) row[k] = num(r[k]);
        if (str(r.supplier)) row.supplier_id = await supId(r.supplier);
        if (r.expiry) row.track_expiry = true;
        const saved = await saveEntity(be, 'products', row);
        if (!ex) products.push(saved);
        ex ? updated++ : created++;
        if (num(r.qty) > 0) openings.push({ product_id: saved.id, qty: num(r.qty), lot_no: str(r.lot_no) || `OPEN-${saved.sku}`, expiry: toISODate(r.expiry) });
      }
      if (openings.length) {
        // Reuse an existing lot with the same number (re-import), otherwise create it.
        const fresh = openings.filter((o) => !db.lots.some((l) => l.product_id === o.product_id && l.lot_no === o.lot_no));
        const created = fresh.length ? await be.insert('lots', fresh.map((o) => ({ product_id: o.product_id, lot_no: o.lot_no, expiry: o.expiry, received_at: new Date().toISOString() }))) : [];
        const lots = openings.map((o) => db.lots.find((l) => l.product_id === o.product_id && l.lot_no === o.lot_no) || created.find((l) => l.product_id === o.product_id && l.lot_no === o.lot_no));
        await be.insert('movements', lots.map((l, i) => ({ ts: new Date().toISOString(), type: 'opening', product_id: l.product_id, lot_id: l.id, qty: openings[i].qty, ref_type: 'import', note: `ייבוא ${preview.file}`, user_email: be.user?.email || '' })));
      }
    }
    setPreview(null);
    return { created, updated };
  }, (r) => `ייבוא הושלם: ${r.created} חדשים, ${r.updated} עודכנו`);

  const fields = IMPORT_KINDS[kind].fields;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ייבוא מאקסל" sub="העלו קובץ Excel/CSV – העמודות מזוהות אוטומטית. רשומות קיימות (לפי מק״ט / קוד / שם) מתעדכנות." />
      <div className="flex flex-wrap gap-2">
        {Object.entries(IMPORT_KINDS).map(([k, v]) => (
          <button key={k} onClick={() => { setKind(k); setPreview(null); }} className={`chip !px-4 !py-2 !text-sm ${kind === k ? 'border-phantom bg-phantom/15 text-phantom-soft' : 'text-slate-400'}`}>{v.label}</button>
        ))}
      </div>
      <Panel title={IMPORT_KINDS[kind].label} icon={FileSpreadsheet} tone="text-healthy"
        actions={<button className="btn text-xs" onClick={() => downloadTemplate(kind)}><Download size={14} /> הורדת תבנית</button>}>
        <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && load(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition ${over ? 'border-phantom text-phantom' : 'border-coal-600 text-slate-400 hover:border-phantom/60'}`}>
          <UploadCloud size={28} />
          <span className="text-sm">גררו קובץ לכאן או לחצו לבחירה</span>
          <span className="text-[11px] text-slate-500">עמודות נתמכות: {Object.values(fields).map((a) => a[0]).join(' · ')}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { e.target.files[0] && load(e.target.files[0]); e.target.value = ''; }} />
        </label>
        {kind === 'products' && <p className="mt-2 text-[11px] text-slate-500">אם בקובץ יש עמודת "כמות במלאי" – תיווצר תנועת יתרת פתיחה (עם אצווה ותפוגה אם צוינו). ספקים שלא קיימים ייווצרו אוטומטית.</p>}
      </Panel>

      {preview && (
        <Panel title={`תצוגה מקדימה · ${preview.file}`} icon={CheckCircle2} tone="text-healthy" bodyClass="p-0"
          actions={<>
            <Badge color="#10B981">{preview.rows.length} שורות תקינות</Badge>
            <button className="btn btn-primary" disabled={busy || preview.missing.length > 0 || !preview.rows.length} onClick={commit}>ייבוא</button>
          </>}>
          <div className="flex flex-wrap gap-1.5 border-b border-coal-700 p-3 text-[11px]">
            {Object.entries(fields).map(([f, a]) => (
              <span key={f} className={`rounded border px-2 py-0.5 ${preview.map[f] ? 'border-healthy/40 text-healthy-soft' : IMPORT_KINDS[kind].required.includes(f) ? 'border-critical/60 text-critical-soft' : 'border-coal-700 text-slate-500'}`}>
                {a[0]} {preview.map[f] ? `← "${preview.map[f]}"` : '— לא נמצא'}
              </span>
            ))}
          </div>
          {preview.missing.length > 0 && <p className="p-3 text-sm text-critical-soft">חסרות עמודות חובה – בדקו את שורת הכותרות בקובץ או השתמשו בתבנית.</p>}
          <Table className="max-h-[360px]" head={Object.keys(preview.map).map((f) => fields[f][0])}>
            {preview.rows.slice(0, 50).map((r, i) => (
              <tr key={i}>{Object.keys(preview.map).map((f) => <td key={f} className="px-3 py-1.5 text-xs text-slate-300">{r[f] instanceof Date ? toISODate(r[f]) : String(r[f] ?? '')}</td>)}</tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}
