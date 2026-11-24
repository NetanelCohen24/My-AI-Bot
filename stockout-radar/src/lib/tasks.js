/**
 * Field-task generator: turns alerts into a grouped, copy-ready brief
 * for WhatsApp (uses *bold* / emoji) or e-mail (plain text).
 */
import { STATUS, fmtN, fmtCover } from './engine.js';
import { longDate } from './dates.js';

export const TASK_TYPES = ['phantom', 'critical', 'oos', 'drop', 'spike'];

const ICON = { phantom: '🟠', critical: '🔴', oos: '🟣', drop: '🔻', spike: '🔵' };

export function actionFor(c) {
  switch (c.status) {
    case 'phantom':
      return `ספירת מדף + מחסן אחורי. מערכת מציגה ${fmtN(c.invNow)} יח׳ אך ${c.zeroStreak} ימים אין מכירה. לאתר מלאי חבוי / פג תוקף / מיקום שגוי ולעדכן ספירה.`;
    case 'oos':
      return `אזל מהמלאי. לוודא משלוח קרוב / לבצע הזמנה דחופה. אובדן משוער ~${fmtN(c.baseAvg, 0)} יח׳ ליום.`;
    case 'critical':
      return `נפילה חדה (${fmtN(c.lastQty)} מול צפי ${fmtN(c.expected, 0)}). לבדוק נראות מדף, תמחור, תקלת קופה/ברקוד.`;
    case 'drop':
      return `ירידה חריגה (${fmtN(c.lastQty)} מול צפי ${fmtN(c.expected, 0)}). לבדוק פייסינג ומבצע מתחרה.`;
    case 'spike':
      return `ביקוש חריג (${fmtN(c.lastQty)} מול צפי ${fmtN(c.expected, 0)}). למלא מדף ולהגדיל הזמנה – כיסוי ${fmtCover(c.daysCover)} ימים.`;
    default:
      return '';
  }
}

/**
 * @param {Array} cells analysed cells
 * @param {{groupBy:'region'|'chain', types:string[], format:'whatsapp'|'email', asOf:string, maxPerStore?:number}} opt
 */
export function buildTaskList(cells, opt) {
  const { groupBy, types, format, asOf } = opt;
  const wa = format === 'whatsapp';
  const b = (s) => (wa ? `*${s}*` : s);
  const picked = cells
    .filter((c) => types.includes(c.status))
    .sort((a, z) => STATUS[a.status].rank - STATUS[z.status].rank || z.severity - a.severity);

  const groups = new Map();
  for (const c of picked) {
    const g = c[groupBy] || 'לא משויך';
    if (!groups.has(g)) groups.set(g, new Map());
    const stores = groups.get(g);
    if (!stores.has(c.store)) stores.set(c.store, []);
    stores.get(c.store).push(c);
  }

  const counts = TASK_TYPES.filter((t) => types.includes(t))
    .map((t) => `${wa ? ICON[t] + ' ' : ''}${STATUS[t].label}: ${picked.filter((c) => c.status === t).length}`)
    .join(wa ? '\n' : ' | ');

  const lines = [];
  if (!wa) lines.push(`נושא: משימות שטח – Stockout Radar – ${longDate(asOf)}`, '');
  lines.push(`${wa ? '📡 ' : ''}${b(`STOCKOUT RADAR · משימות שטח · ${longDate(asOf)}`)}`);
  lines.push(`סה״כ ${picked.length} משימות ב-${new Set(picked.map((c) => c.store)).size} סניפים`);
  lines.push(counts, '');

  const sortedGroups = [...groups.entries()].sort((a, z) => countIn(z[1]) - countIn(a[1]));
  for (const [g, stores] of sortedGroups) {
    lines.push(wa ? `━━━━━━━━━━━━━━` : '==============================');
    lines.push(`${wa ? '📍 ' : ''}${b(`${groupBy === 'region' ? 'אזור' : 'רשת'}: ${g}`)} (${countIn(stores)})`);
    for (const [, list] of stores) {
      const c0 = list[0];
      const other = groupBy === 'region' ? c0.chain : c0.region;
      lines.push('');
      lines.push(`${wa ? '🏬 ' : '» '}${b(`${c0.chain === other ? '' : other + ' · '}${c0.storeName || 'סניף'} #${c0.store}`)}`);
      list.forEach((c, i) => {
        lines.push(`${wa ? ICON[c.status] : `${i + 1}.`} ${b(c.product)} [${c.sku}]`);
        lines.push(`   ${STATUS[c.status].label} – ${actionFor(c)}`);
      });
    }
    lines.push('');
  }
  lines.push(wa ? '_נא לאשר ביצוע בהודעה חוזרת עם ✅ + צילום מדף_' : 'נא לאשר ביצוע במענה למייל זה, כולל צילום מדף.');
  return { text: lines.join('\n'), count: picked.length, groups: groups.size };
}

const countIn = (stores) => [...stores.values()].reduce((s, l) => s + l.length, 0);
