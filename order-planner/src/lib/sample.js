/**
 * Synthetic workbook in the same layout as the company file (made-up products & numbers).
 * Used for the demo button and as a downloadable template.
 */
import { addMonths } from './engine.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// name, brand, supplier, origin, country, lead, unitsPerCase, casesPerPallet, shelfLifeDays, monthly, price, min
const P = [
  ['פתיתים אורגניים 500 גרם', 'שדות', 'מילאנו פסטה', 'יבוא', 'איטליה', 90, 12, 120, 540, 420, 9.9, 300],
  ['ספגטי מלא אורגני 500 גרם', 'שדות', 'מילאנו פסטה', 'יבוא', 'איטליה', 90, 12, 120, 540, 380, 8.9, 250],
  ['פנה מלא אורגני 500 גרם', 'שדות', 'מילאנו פסטה', 'יבוא', 'איטליה', 90, 12, 120, 540, 260, 8.9, 0],
  ['רוטב עגבניות אורגני 680 גרם', 'שדות', 'מילאנו פסטה', 'יבוא', 'איטליה', 90, 6, 140, 720, 150, 14.5, 0],
  ['שמן זית כתית 750 מ״ל', 'זית הכפר', 'אנדלוסיה אויל', 'יבוא', 'ספרד', 120, 6, 100, 600, 210, 39, 100],
  ['שמן קוקוס אורגני 350 מ״ל', 'זית הכפר', 'אנדלוסיה אויל', 'יבוא', 'ספרד', 120, 12, 90, 720, 70, 24, 0],
  ['קינואה לבנה אורגנית 500 גרם', 'שדות', 'אנדס גריינס', 'יבוא', 'פרו', 150, 12, 110, 450, 180, 22, 0],
  ['צ׳יה אורגנית 250 גרם', 'שדות', 'אנדס גריינס', 'יבוא', 'פרו', 150, 12, 130, 360, 95, 18, 0],
  ['קוואקר עדין אורגני 500 גרם', 'בוקר טוב', 'נורדיק אוטס', 'יבוא', 'פינלנד', 70, 12, 96, 300, 330, 12.9, 200],
  ['גרנולה אגוזים 350 גרם', 'בוקר טוב', 'נורדיק אוטס', 'יבוא', 'פינלנד', 70, 8, 100, 240, 140, 21.9, 0],
  ['משקה שקדים 1 ליטר', 'טבעי+', 'משקאות הגליל', 'מקומי', 'ישראל', 14, 12, 80, 270, 610, 14.9, 400],
  ['משקה שיבולת שועל 1 ליטר', 'טבעי+', 'משקאות הגליל', 'מקומי', 'ישראל', 14, 12, 80, 270, 540, 13.9, 350],
  ['טחינה גולמית אורגנית 500 גרם', 'טבעי+', 'סומסום בע״מ', 'מקומי', 'ישראל', 21, 12, 144, 365, 260, 19.9, 150],
  ['חלבה אורגנית 400 גרם', 'טבעי+', 'סומסום בע״מ', 'מקומי', 'ישראל', 21, 12, 144, 300, 90, 17.9, 0],
  ['חטיף תירס ואורז 60 גרם', 'קראנצ׳', 'חטיפי הנגב', 'מקומי', 'ישראל', 30, 12, 160, 240, 300, 5.9, 0],
  ['פריכיות אורז מלא 100 גרם', 'קראנצ׳', 'חטיפי הנגב', 'מקומי', 'ישראל', 30, 12, 200, 270, 230, 7.9, 0],
  ['אבקת מרק ירקות 200 גרם', 'שדות', 'ברלין פודס', 'יבוא', 'גרמניה', 180, 6, 228, 540, 280, 17.3, 0],
  ['ממרח תמרים 350 גרם', 'טבעי+', 'תמרי הערבה', 'מקומי', 'ישראל', 21, 12, 120, 300, 60, 16.9, 0],
];

/** Returns [{ name, rows: any[][] }] like readWorkbook, plus an optional "as of" date. */
export function sampleSheets(asOf = new Date().toISOString().slice(0, 10)) {
  const r = rng(11);
  const cur = asOf.slice(0, 7);
  const months = [];
  for (let i = 18; i >= 1; i--) months.push(addMonths(cur, -i));
  const mDate = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1));
  const day = (n) => new Date(Date.parse(asOf) + n * 86400000);

  const stock = [['חומר', 'תיאור חומר', 'תאריך פג תוקף', 'בלתי-מוגבל', 'יח\' בתיבה', 'מכר ממוצע לחודש (תיבות)', 'מס\' ימים לחסימת מוצר לפני תום תוקף', 'ספק', 'יצור מקומי/ יבוא', 'ארץ יצור יבוא', 'lead time להזמנה', 'כמות מינימום במחסן תיבות', 'מותג', 'ABC']];
  const sales = [['מותג', 'מקט טמפו', 'שם פריט', ...months.map(mDate)]];
  const master = [['חומר', 'תיאור חומר', 'מחירון', 'כמות יח\' בתיבת מכר', 'כמות תיבות במשטח במחסן', 'מותג', 'ספק', 'יצור מקומי/ יבוא', 'lead time להזמנה', 'כמות מינימום בתיבות במחסן מלאי בטחון', 'חיי מדף בימים']];

  P.forEach((p, i) => {
    const sku = String(7020101 + i);
    const [name, brand, sup, origin, country, lead, upc, cpp, shelf, monthly, price, min] = p;
    // Sales with season + noise; a couple of products trending.
    const trend = i === 8 ? 0.04 : i === 3 ? -0.03 : 0;
    const hist = months.map((_, k) => Math.max(0, Math.round(monthly * (1 + trend * (k - 12)) * (0.8 + r() * 0.4))));
    sales.push([brand, sku, name, ...hist]);
    master.push([sku, name, price, upc, cpp, brand, sup, origin, lead, min, shelf]);
    // Batches — with built-in scenarios.
    const batches = [];
    const cover = { 0: 0.4, 4: 0.3, 6: 2.5, 10: 0.2, 12: 1.2, 16: 9, 7: 4, 13: 3 }[i] ?? 1 + r() * 3;
    let qty = Math.round(monthly * cover);
    if (i === 10) qty = 0; // out of stock
    const expBase = Math.round(shelf * (0.3 + r() * 0.5));
    if (qty > 0) {
      const split = qty > monthly * 1.5 ? 2 : 1;
      for (let k = 0; k < split; k++) batches.push([day(expBase + k * 60), Math.round(qty / split)]);
    }
    if (i === 7) batches[0][0] = day(70);     // chia: too much stock, expires soon → risk
    if (i === 13) batches[0][0] = day(50);    // halva: slow + close expiry → risk
    if (i === 14) batches.push([day(-5), 40]); // already past expiry
    for (const [exp, q] of batches) stock.push([sku, name, exp, q, upc, monthly, 30, sup, origin, country, lead, min, brand, i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C']);
  });

  return [
    { name: 'מאסטר מלאי מול תוקף', rows: stock },
    { name: 'מכר חודשי', rows: sales },
    { name: 'זמני אספקה ויצרן', rows: master },
  ];
}

export async function downloadSampleWorkbook() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const sh of sampleSheets()) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  }
  XLSX.writeFile(wb, 'קובץ-דוגמה-מתכנן-הזמנות.xlsx');
}
