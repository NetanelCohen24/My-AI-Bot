/* =====================================================================
   TradeQuery AI — Built-in FMCG dataset (deterministic synthetic data)
   ---------------------------------------------------------------------
   24 months (Oct-2024 → Sep-2026) × 20 branches × 40 products
   Tables: sales (monthly sell-out), inventory (end-of-period snapshot)
   All chains, brands and branches are fictional.
   ===================================================================== */
(function (global) {
  'use strict';

  // ---------- seeded RNG (mulberry32) ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- master data ----------
  const CHAINS = [
    { name: 'סופר גל',     en: ['super gal', 'supergal'], priceF: 1.00, sizeF: 1.20, trend: 0.002,
      branches: [['דיזנגוף', 'תל אביב', 1.25], ['מלחה', 'ירושלים', 1.1], ['חורב', 'חיפה', 0.95], ['עזריאלי מודיעין', 'מודיעין', 0.9]] },
    { name: 'אורן מרקט',   en: ['oren market', 'oren'], priceF: 1.02, sizeF: 1.00, trend: -0.004,
      branches: [['רמת אביב', 'תל אביב', 1.0], ['תלפיות', 'ירושלים', 1.05], ['גרנד קניון', 'חיפה', 1.0], ['הקריה', 'באר שבע', 0.85]] },
    { name: 'שוק עירוני',  en: ['shuk ironi', 'ironi', 'city market'], priceF: 0.97, sizeF: 0.85, trend: 0.003,
      branches: [['הרצל', 'ראשון לציון', 0.95], ['סירקין', 'פתח תקווה', 0.9], ['פולג', 'נתניה', 0.85], ['סיטי', 'אשדוד', 0.9]] },
    { name: 'פרש פוינט',   en: ['fresh point', 'freshpoint'], priceF: 1.08, sizeF: 0.80, trend: 0.006,
      branches: [['פיתוח', 'הרצליה', 1.0], ['כיכר המדינה', 'תל אביב', 1.1], ['עמק רפאים', 'ירושלים', 0.95], ['רעננה סנטר', 'רעננה', 0.9]] },
    { name: 'חסכון פלוס',  en: ['hisachon plus', 'hisachon', 'saving plus'], priceF: 0.90, sizeF: 1.35, trend: 0.004,
      branches: [['אזור תעשייה', 'באר שבע', 1.15], ['מתחם BIG', 'אשדוד', 1.1], ['צ׳ק פוסט', 'חיפה', 1.05], ['גבעת שאול', 'ירושלים', 1.0]] }
  ];

  // name, alias[], brand, category, health, unitCost, price, baseUnits/branch/month, season, monthly trend
  const P = (name, alias, brand, cat, health, cost, price, bu, season, g) =>
    ({ name, alias, brand, cat, health, cost, price, bu, season, g });
  const PRODUCTS = [
    // מוצרי חלב
    P('חלב 3% 1 ליטר', ['חלב 3%'], 'שדות', 'מוצרי חלב', 0, 4.6, 6.4, 2600, 'flat', 0.001),
    P('יוגורט חלבון 200 גרם', ['יוגורט חלבון'], 'פרוטו', 'מוצרי חלב', 1, 3.1, 5.9, 1500, 'flat', 0.018),
    P('גבינה לבנה 5%', ['גבינה לבנה'], 'שדות', 'מוצרי חלב', 0, 3.9, 5.8, 1700, 'holiday', 0.002),
    P('קוטג׳ 5%', ['קוטג׳', 'קוטג'], 'שדות', 'מוצרי חלב', 0, 4.4, 6.2, 2100, 'flat', 0.001),
    P('משקה סויה ללא סוכר', ['משקה סויה'], 'נטורה', 'מוצרי חלב', 1, 6.2, 11.9, 520, 'flat', 0.015),
    // משקאות
    P('קולה 1.5 ליטר', ['קולה'], 'ברק', 'משקאות', 0, 4.1, 7.9, 2200, 'summer', 0.001),
    P('מים מינרליים 6×1.5 ליטר', ['מים מינרליים', 'מים'], 'קריסטל', 'משקאות', 0, 8.5, 14.9, 1300, 'summer', 0.003),
    P('מיץ תפוזים סחוט 1 ליטר', ['מיץ תפוזים'], 'פרש', 'משקאות', 0, 7.8, 12.9, 640, 'winter', 0.002),
    P('משקה אנרגיה 250 מ״ל', ['משקה אנרגיה'], 'וולט', 'משקאות', 0, 3.2, 7.5, 900, 'summer', 0.020),
    P('תה קר ללא סוכר', ['תה קר'], 'נטורה', 'משקאות', 1, 3.6, 7.9, 560, 'summer', 0.022),
    // חטיפים
    P('חטיף בוטנים 80 גרם', ['חטיף בוטנים'], 'גולדן', 'חטיפים', 0, 2.3, 4.9, 2400, 'holiday', 0.002),
    P('חטיף צ׳יפס 70 גרם', ['חטיף צ׳יפס', 'צ׳יפס', 'ציפס'], 'גולדן', 'חטיפים', 0, 2.5, 5.2, 1900, 'holiday', 0.001),
    P('שוקולד חלב 100 גרם', ['שוקולד חלב', 'שוקולד'], 'מתוקה', 'חטיפים', 0, 3.4, 6.9, 1600, 'winter', 0.000),
    P('חטיף שיבולת שועל', ['חטיף שיבולת שועל', 'חטיף אנרגיה'], 'נטורה', 'חטיפים', 1, 2.1, 4.9, 820, 'flat', 0.019),
    P('פריכיות אורז מלא', ['פריכיות'], 'טבע-לי', 'חטיפים', 1, 3.0, 6.5, 740, 'flat', 0.014),
    // דגנים ומאפים
    P('לחם מלא פרוס', ['לחם מלא'], 'האופה', 'דגנים ומאפים', 1, 6.1, 11.5, 1400, 'flat', 0.010),
    P('לחם אחיד', ['לחם אחיד', 'לחם לבן'], 'האופה', 'דגנים ומאפים', 0, 4.9, 6.4, 2600, 'flat', -0.002),
    P('קורנפלקס 750 גרם', ['קורנפלקס'], 'בוקר טוב', 'דגנים ומאפים', 0, 9.5, 17.9, 700, 'winter', -0.001),
    P('גרנולה ללא תוספת סוכר', ['גרנולה'], 'טבע-לי', 'דגנים ומאפים', 1, 11.2, 22.9, 430, 'flat', 0.017),
    P('פסטה ספגטי 500 גרם', ['פסטה', 'ספגטי'], 'בוקר טוב', 'דגנים ומאפים', 0, 3.1, 5.9, 1500, 'winter', 0.001),
    // ניקיון
    P('אבקת כביסה 3 ק״ג', ['אבקת כביסה'], 'נקי', 'ניקיון', 0, 22.0, 34.9, 380, 'holiday', -0.005),
    P('נוזל כלים 1 ליטר', ['נוזל כלים'], 'נקי', 'ניקיון', 0, 5.6, 9.9, 900, 'holiday', -0.002),
    P('מרכך כביסה 2 ליטר', ['מרכך כביסה'], 'רכות', 'ניקיון', 0, 9.9, 16.9, 520, 'flat', -0.003),
    P('אקונומיקה 2 ליטר', ['אקונומיקה'], 'נקי', 'ניקיון', 0, 4.2, 7.9, 610, 'holiday', -0.004),
    P('מגבונים לחים 72 יח׳', ['מגבונים'], 'רכות', 'ניקיון', 0, 4.8, 9.9, 980, 'flat', 0.004),
    // טיפוח
    P('שמפו 750 מ״ל', ['שמפו'], 'לבנדר', 'טיפוח', 0, 9.4, 18.9, 560, 'flat', 0.000),
    P('משחת שיניים', ['משחת שיניים'], 'חיוך', 'טיפוח', 0, 5.2, 11.9, 760, 'flat', 0.001),
    P('דאודורנט ספריי', ['דאודורנט'], 'לבנדר', 'טיפוח', 0, 7.7, 16.9, 470, 'summer', 0.002),
    P('סבון גוף טבעי', ['סבון גוף'], 'טבע-לי', 'טיפוח', 1, 8.1, 19.9, 330, 'flat', 0.012),
    P('קרם הגנה SPF50', ['קרם הגנה'], 'לבנדר', 'טיפוח', 0, 19.0, 44.9, 160, 'summer_strong', 0.004),
    // מזון בריאות
    P('טחינה גולמית 500 גרם', ['טחינה'], 'הר ברכה', 'מזון בריאות', 1, 9.0, 18.9, 820, 'holiday', 0.012),
    P('חמאת בוטנים טבעית', ['חמאת בוטנים'], 'נטורה', 'מזון בריאות', 1, 11.8, 24.9, 380, 'flat', 0.016),
    P('קינואה 500 גרם', ['קינואה'], 'טבע-לי', 'מזון בריאות', 1, 10.4, 21.9, 300, 'flat', 0.014),
    P('תמרים מג׳הול 500 גרם', ['תמרים'], 'הבקעה', 'מזון בריאות', 1, 17.5, 32.9, 290, 'holiday', 0.010),
    P('שקדים טבעיים 300 גרם', ['שקדים'], 'גולדן', 'מזון בריאות', 1, 15.9, 29.9, 330, 'flat', 0.015),
    // קפואים
    P('פיצה קפואה משפחתית', ['פיצה קפואה', 'פיצה'], 'פריזר', 'קפואים', 0, 13.0, 24.9, 520, 'winter', 0.003),
    P('שניצל תירס 800 גרם', ['שניצל תירס', 'שניצל'], 'פריזר', 'קפואים', 0, 14.5, 26.9, 470, 'flat', 0.002),
    P('ירקות קפואים מעורבים', ['ירקות קפואים'], 'שדות', 'קפואים', 1, 6.8, 12.9, 620, 'winter', 0.009),
    P('גלידה וניל 1 ליטר', ['גלידה'], 'מתוקה', 'קפואים', 0, 9.8, 21.9, 520, 'summer_strong', 0.003),
    P('בורקס גבינה קפוא', ['בורקס'], 'פריזר', 'קפואים', 0, 11.0, 19.9, 560, 'holiday', 0.000)
  ];

  const CATEGORY_EN = {
    'מוצרי חלב': ['dairy', 'milk products'],
    'משקאות': ['beverages', 'beverage', 'drinks'],
    'חטיפים': ['snacks', 'snack'],
    'דגנים ומאפים': ['bakery', 'cereals', 'grains', 'bread'],
    'ניקיון': ['cleaning', 'household'],
    'טיפוח': ['personal care', 'toiletries', 'cosmetics'],
    'מזון בריאות': ['health food', 'health foods'],
    'קפואים': ['frozen']
  };
  const CITY_EN = {
    'תל אביב': ['tel aviv', 'tel-aviv'], 'ירושלים': ['jerusalem'], 'חיפה': ['haifa'],
    'באר שבע': ['beer sheva', 'beersheba', "be'er sheva"], 'ראשון לציון': ['rishon lezion', 'rishon'],
    'פתח תקווה': ['petah tikva', 'petach tikva'], 'נתניה': ['netanya'], 'אשדוד': ['ashdod'],
    'מודיעין': ['modiin', "modi'in"], 'הרצליה': ['herzliya'], 'רעננה': ['raanana', "ra'anana"]
  };

  // ---------- months ----------
  const MONTHS = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.UTC(2024, 9 + i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    MONTHS.push({ i, y, m, ym: `${y}-${String(m).padStart(2, '0')}`, q: `${y}-Q${Math.ceil(m / 3)}` });
  }

  function season(type, m) {
    const c = (peak) => Math.cos(((m - peak) / 12) * 2 * Math.PI);
    switch (type) {
      case 'summer': return 1 + 0.30 * c(7);
      case 'summer_strong': return 1 + 0.75 * c(7);
      case 'winter': return 1 + 0.22 * c(1);
      case 'holiday': return 1 + ([4, 9].includes(m) ? 0.32 : m === 10 ? 0.12 : 0);
      default: return 1;
    }
  }

  // Story-telling events baked into the data (so insights are interesting)
  function eventFactor(chain, p, mo) {
    let f = 1;
    // Super Gal health-food promotion in Q3-2026
    if (chain.name === 'סופר גל' && p.cat === 'מזון בריאות' && mo.q === '2026-Q3') f *= 1.42;
    // Oren Market freezer-line outage, Aug-2026
    if (chain.name === 'אורן מרקט' && p.cat === 'קפואים' && (mo.ym === '2026-08' || mo.ym === '2026-09')) f *= 0.72;
    // Fresh Point is the health destination: health grows extra fast there
    if (chain.name === 'פרש פוינט' && p.health) f *= Math.pow(1.011, mo.i);
    // Hisachon Plus cleaning private-label push from 2026
    if (chain.name === 'חסכון פלוס' && p.cat === 'ניקיון' && mo.y === 2026) f *= 1.15;
    // Shuk Ironi energy-drink listing in 2026-Q2
    if (chain.name === 'שוק עירוני' && p.name.startsWith('משקה אנרגיה') && mo.i >= 18) f *= 1.35;
    return f;
  }

  // Supplier cost → retailer gross margin ≈ 26-30% (regular) / 36-40% (health)
  function baseCost(p) {
    const ratio = (p.health ? 0.625 : 0.725) + ((p.cost / p.price) - 0.55) * 0.12;
    return p.price * ratio;
  }

  function build() {
    const r = rng(20261124);
    const sales = [];
    const last3 = {}; // branch|product -> units in last 3 months
    CHAINS.forEach((ch) => {
      ch.branches.forEach(([bname, city, bsize]) => {
        PRODUCTS.forEach((p) => {
          const pf = 0.92 + r() * 0.16; // branch-product affinity
          MONTHS.forEach((mo) => {
            const trend = Math.pow(1 + p.g + ch.trend, mo.i);
            const elastic = Math.pow(ch.priceF, -1.3);
            const noise = 0.9 + r() * 0.2;
            const units = Math.max(0, Math.round(
              p.bu * ch.sizeF * bsize * pf * season(p.season, mo.m) * trend * elastic * eventFactor(ch, p, mo) * noise));
            const price = p.price * ch.priceF * Math.pow(1.0015, mo.i);
            const unitCost = baseCost(p) * Math.pow(1.0025, mo.i);
            const revenue = Math.round(units * price * 100) / 100;
            const cogs = Math.round(units * unitCost * 100) / 100;
            sales.push({
              sale_month: mo.ym, sale_quarter: mo.q, sale_year: mo.y,
              chain: ch.name, branch: bname, city,
              category: p.cat, product: p.name, brand: p.brand,
              segment: p.health ? 'בריאות' : 'רגיל',
              units, revenue, cogs,
              gross_profit: Math.round((revenue - cogs) * 100) / 100
            });
            if (mo.i >= 21) {
              const k = bname + '|' + p.name;
              last3[k] = (last3[k] || 0) + units;
            }
          });
        });
      });
    });

    const inventory = [];
    CHAINS.forEach((ch) => {
      ch.branches.forEach(([bname, city]) => {
        PRODUCTS.forEach((p) => {
          const avgDaily = (last3[bname + '|' + p.name] || 0) / 92;
          const x = r();
          let days;
          if (x < 0.11) days = 1 + r() * 5.5;          // shortage risk
          else if (x < 0.19) days = 62 + r() * 60;     // overstock
          else days = 10 + r() * 34;                   // healthy
          if (p.health && ch.name === 'סופר גל' && p.cat === 'מזון בריאות') days = Math.min(days, 3 + r() * 4); // promo drained shelves
          const stock = Math.round(avgDaily * days);
          const cover = avgDaily > 0 ? Math.round((stock / avgDaily) * 10) / 10 : 0;
          const unitCost = baseCost(p) * Math.pow(1.0025, 23);
          inventory.push({
            snapshot_date: '2026-09-30',
            chain: ch.name, branch: bname, city,
            category: p.cat, product: p.name, brand: p.brand,
            segment: p.health ? 'בריאות' : 'רגיל',
            stock_units: stock,
            avg_daily_units: Math.round(avgDaily * 10) / 10,
            days_of_cover: cover,
            stock_value: Math.round(stock * unitCost),
            stock_status: cover < 7 ? 'חוסר צפוי' : cover > 60 ? 'עודף' : 'תקין'
          });
        });
      });
    });
    return { sales, inventory };
  }

  global.TQData = {
    build, CHAINS, PRODUCTS, CATEGORY_EN, CITY_EN, MONTHS,
    schema: {
      sales: [
        ['sale_month', 'STRING', 'חודש (YYYY-MM)'], ['sale_quarter', 'STRING', 'רבעון (YYYY-Q#)'], ['sale_year', 'INT', 'שנה'],
        ['chain', 'STRING', 'רשת שיווק'], ['branch', 'STRING', 'סניף'], ['city', 'STRING', 'עיר'],
        ['category', 'STRING', 'קטגוריה'], ['product', 'STRING', 'מוצר'], ['brand', 'STRING', 'מותג'],
        ['segment', 'STRING', 'בריאות / רגיל'], ['units', 'INT', 'יחידות שנמכרו'], ['revenue', 'NUMBER', 'הכנסות ₪'],
        ['cogs', 'NUMBER', 'עלות מכר ₪'], ['gross_profit', 'NUMBER', 'רווח גולמי ₪']
      ],
      inventory: [
        ['snapshot_date', 'STRING', 'תאריך תמונת מלאי'], ['chain', 'STRING', 'רשת'], ['branch', 'STRING', 'סניף'], ['city', 'STRING', 'עיר'],
        ['category', 'STRING', 'קטגוריה'], ['product', 'STRING', 'מוצר'], ['brand', 'STRING', 'מותג'], ['segment', 'STRING', 'בריאות / רגיל'],
        ['stock_units', 'INT', 'יחידות במלאי'], ['avg_daily_units', 'NUMBER', 'מכירה יומית ממוצעת'],
        ['days_of_cover', 'NUMBER', 'ימי מלאי'], ['stock_value', 'NUMBER', 'שווי מלאי ₪'], ['stock_status', 'STRING', 'חוסר צפוי / תקין / עודף']
      ]
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
