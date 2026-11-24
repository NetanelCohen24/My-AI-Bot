/** Print a light, paper-friendly RTL document via a hidden iframe (no popup blockers). */
export function printDoc(title, parts) {
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:Heebo,Arial,sans-serif;color:#111;margin:24px;font-size:13px}
  h1{font-size:20px;margin:0 0 6px} p{margin:4px 0}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  th,td{border:1px solid #bbb;padding:6px 8px;text-align:right} th{background:#f1f1f1}
  tfoot td{font-weight:600}
  .sig{margin-top:40px}
  .brand{float:left;font-size:11px;color:#666}
</style></head><body><div class="brand">Depot · ${new Date().toLocaleString('he-IL')}</div>${parts.join('')}</body></html>`;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:0;bottom:0';
  document.body.appendChild(f);
  f.contentDocument.open();
  f.contentDocument.write(html);
  f.contentDocument.close();
  setTimeout(() => {
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 1000);
  }, 250);
}
