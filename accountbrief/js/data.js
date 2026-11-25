/* =====================================================================
   AccountBrief AI — Built-in FMCG dataset (deterministic synthetic data)
   ---------------------------------------------------------------------
   25 months (Oct-2024 → Oct-2026) × 20 customer accounts × 40 products
   Tables: customers (account master), sales (monthly sell-in per account),
           inventory (shelf/stock snapshot per account)
   Every chain, brand, branch, customer and account manager is fictional.
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
  for (let i = 0; i < 25; i++) {
    const d = new Date(Date.UTC(2024, 9 + i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    MONTHS.push({ i, y, m, ym: `${y}-${String(m).padStart(2, '0')}`, q: `${y}-Q${Math.ceil(m / 3)}` });
  }
  const SNAPSHOT_DATE = '2026-11-24';
  const ABANDON_FROM = '2026-09'; // "not ordered in the last 60 days" ⇔ no units in Sep–Oct 2026

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
    if (chain.name === 'סופר גל' && p.cat === 'מזון בריאות' && mo.q === '2026-Q3') f *= 1.42;
    if (chain.name === 'אורן מרקט' && p.cat === 'קפואים' && (mo.ym === '2026-08' || mo.ym === '2026-09')) f *= 0.72;
    if (chain.name === 'פרש פוינט' && p.health) f *= Math.pow(1.011, mo.i);
    if (chain.name === 'חסכון פלוס' && p.cat === 'ניקיון' && mo.y === 2026) f *= 1.15;
    if (chain.name === 'שוק עירוני' && p.name.startsWith('משקה אנרגיה') && mo.i >= 18) f *= 1.35;
    return f;
  }

  // ---------- customer accounts (one per branch) ----------
  const MANAGERS = { 'סופר גל': 'דנה לוי', 'אורן מרקט': 'אורי כהן', 'שוק עירוני': 'מיכל אברהם', 'פרש פוינט': 'יואב שגיא', 'חסכון פלוס': 'דנה לוי' };
  const ID_ORDER = { 'דיזנגוף': 1004, 'מלחה': 1001, 'חורב': 1002, 'עזריאלי מודיעין': 1003 };
  // Hand-written account stories for the demo meetings; the rest are generated
  const STORIES = {
    1004: {
      whitespace: ['חמאת בוטנים טבעית', 'תה קר ללא סוכר', 'גרנולה ללא תוספת סוכר'],
      abandoned: ['קורנפלקס 750 גרם', 'מרכך כביסה 2 ליטר'],
      decline: { 'קולה 1.5 ליטר': 0.55 }, creditLimit: 900000, util: 0.62, lastOrder: '2026-11-20'
    },
    1012: {
      whitespace: ['יוגורט חלבון 200 גרם', 'קינואה 500 גרם', 'חטיף שיבולת שועל'],
      abandoned: ['שמפו 750 מ״ל', 'גלידה וניל 1 ליטר'],
      decline: {}, slump: 0.78, creditLimit: 450000, util: 0.94, lastOrder: '2026-09-29'
    },
    1009: { whitespace: ['משקה סויה ללא סוכר', 'שקדים טבעיים 300 גרם', 'קרם הגנה SPF50'], abandoned: ['אקונומיקה 2 ליטר'], decline: { 'חטיף צ׳יפס 70 גרם': 0.6 }, creditLimit: 400000, util: 0.48, lastOrder: '2026-11-18' },
    1017: { whitespace: ['סבון גוף טבעי', 'פריכיות אורז מלא', 'ירקות קפואים מעורבים'], abandoned: ['מיץ תפוזים סחוט 1 ליטר'], decline: {}, creditLimit: 1200000, util: 0.71, lastOrder: '2026-11-23' },
    1013: { whitespace: ['קינואה 500 גרם', 'משקה אנרגיה 250 מ״ל', 'בורקס גבינה קפוא'], abandoned: ['לחם אחיד'], decline: {}, creditLimit: 500000, util: 0.39, lastOrder: '2026-11-21' }
  };

  function accounts(r) {
    const list = [];
    let next = 1005;
    CHAINS.forEach((ch) => ch.branches.forEach(([bname, city, bsize]) => {
      const id = ch.name === 'סופר גל' ? ID_ORDER[bname] : next++;
      list.push({ id, chain: ch, bname, city, bsize });
    }));
    return list.map((a) => {
      const st = STORIES[a.id] || {};
      const pick = (n, exclude) => {
        const out = [];
        while (out.length < n) {
          const p = PRODUCTS[Math.floor(r() * PRODUCTS.length)].name;
          if (!out.includes(p) && !(exclude || []).includes(p)) out.push(p);
        }
        return out;
      };
      const whitespace = st.whitespace || pick(3);
      const abandoned = st.abandoned || pick(1 + Math.floor(r() * 2), whitespace);
      const sizeK = a.chain.sizeF * a.bsize;
      const creditLimit = st.creditLimit || Math.round((250000 + sizeK * 450000 * (0.8 + r() * 0.4)) / 50000) * 50000;
      const util = st.util || 0.32 + r() * 0.5;
      const lastOrder = st.lastOrder || `2026-11-${String(3 + Math.floor(r() * 21)).padStart(2, '0')}`;
      return {
        ...a, whitespace, abandoned, decline: st.decline || {}, slump: st.slump || 1,
        customer: {
          customer_id: a.id, customer_name: `${a.chain.name} ${a.bname}`, chain: a.chain.name, branch: a.bname, city: a.city,
          account_manager: MANAGERS[a.chain.name], credit_limit: creditLimit, open_balance: Math.round(creditLimit * util),
          payment_terms: a.chain.name === 'חסכון פלוס' ? 'שוטף+90' : 'שוטף+60', last_order_date: lastOrder
        }
      };
    }).sort((x, y) => x.id - y.id);
  }

  // Supplier cost → retailer gross margin ≈ 26-30% (regular) / 36-40% (health)
  function baseCost(p) {
    const ratio = (p.health ? 0.625 : 0.725) + ((p.cost / p.price) - 0.55) * 0.12;
    return p.price * ratio;
  }

  function build() {
    const r = rng(20261124);
    const accts = accounts(rng(1004));
    const sales = [];
    const last3 = {};
    accts.forEach((a) => {
      const ch = a.chain, c = a.customer;
      const acctCols = { customer_id: c.customer_id, customer_name: c.customer_name, account_manager: c.account_manager, credit_limit: c.credit_limit, last_order_date: c.last_order_date };
      PRODUCTS.forEach((p) => {
        const pf = 0.92 + r() * 0.16;
        if (a.whitespace.includes(p.name)) return; // never listed at this account → white space
        MONTHS.forEach((mo) => {
          const trend = Math.pow(1 + p.g + ch.trend, mo.i);
          const elastic = Math.pow(ch.priceF, -1.3);
          const noise = 0.9 + r() * 0.2;
          let f = eventFactor(ch, p, mo);
          if (a.decline[p.name] && mo.ym >= '2026-07') f *= a.decline[p.name];
          if (a.slump < 1 && mo.ym >= '2026-07') f *= a.slump;
          if (a.abandoned.includes(p.name) && mo.ym >= ABANDON_FROM) f = 0;
          const units = Math.max(0, Math.round(p.bu * ch.sizeF * a.bsize * pf * season(p.season, mo.m) * trend * elastic * f * noise));
          const price = p.price * ch.priceF * Math.pow(1.0015, mo.i);
          const unitCost = baseCost(p) * Math.pow(1.0025, mo.i);
          const revenue = Math.round(units * price * 100) / 100;
          const cogs = Math.round(units * unitCost * 100) / 100;
          sales.push({
            sale_month: mo.ym, sale_quarter: mo.q, sale_year: mo.y,
            chain: ch.name, branch: a.bname, city: a.city, ...acctCols,
            category: p.cat, product: p.name, brand: p.brand,
            segment: p.health ? 'בריאות' : 'רגיל',
            units, revenue, cogs,
            gross_profit: Math.round((revenue - cogs) * 100) / 100
          });
          if (mo.i >= 22) { const k = a.id + '|' + p.name; last3[k] = (last3[k] || 0) + units; }
        });
      });
    });

    const inventory = [];
    accts.forEach((a) => {
      const ch = a.chain, c = a.customer;
      PRODUCTS.forEach((p) => {
        if (a.whitespace.includes(p.name)) return;
        let avgDaily = (last3[a.id + '|' + p.name] || 0) / 92;
        const x = r();
        let days;
        if (x < 0.11) days = 1 + r() * 5.5;
        else if (x < 0.19) days = 62 + r() * 60;
        else days = 10 + r() * 34;
        if (ch.name === 'סופר גל' && p.cat === 'מזון בריאות') days = Math.min(days, 3 + r() * 4); // promo drained shelves
        let stock = Math.round(avgDaily * days);
        if (a.abandoned.includes(p.name)) { stock = Math.round(40 + r() * 80); avgDaily = Math.max(avgDaily, 0.4); }
        const cover = avgDaily > 0 ? Math.round((stock / avgDaily) * 10) / 10 : 0;
        const unitCost = baseCost(p) * Math.pow(1.0025, 24);
        inventory.push({
          snapshot_date: SNAPSHOT_DATE,
          customer_id: c.customer_id, customer_name: c.customer_name, account_manager: c.account_manager,
          credit_limit: c.credit_limit, last_order_date: c.last_order_date,
          chain: ch.name, branch: a.bname, city: a.city,
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
    return { sales, inventory, customers: accts.map((a) => a.customer) };
  }

  const ACCT_COLS = [
    ['customer_id', 'INT', 'קוד לקוח (1001–1020)'], ['customer_name', 'STRING', 'שם הלקוח (רשת + סניף)'],
    ['account_manager', 'STRING', 'מנהל תיק'], ['credit_limit', 'NUMBER', 'מסגרת אשראי ₪'], ['last_order_date', 'STRING', 'תאריך הזמנה אחרון']
  ];
  global.TQData = {
    build, CHAINS, PRODUCTS, CATEGORY_EN, CITY_EN, MONTHS, SNAPSHOT_DATE, ABANDON_FROM,
    schema: {
      customers: [
        ['customer_id', 'INT', 'קוד לקוח'], ['customer_name', 'STRING', 'שם הלקוח'], ['chain', 'STRING', 'רשת'], ['branch', 'STRING', 'סניף'],
        ['city', 'STRING', 'עיר'], ['account_manager', 'STRING', 'מנהל תיק'], ['credit_limit', 'NUMBER', 'מסגרת אשראי ₪'],
        ['open_balance', 'NUMBER', 'יתרה פתוחה ₪'], ['payment_terms', 'STRING', 'תנאי תשלום'], ['last_order_date', 'STRING', 'תאריך הזמנה אחרון']
      ],
      sales: [
        ['sale_month', 'STRING', 'חודש (YYYY-MM)'], ['sale_quarter', 'STRING', 'רבעון (YYYY-Q#)'], ['sale_year', 'INT', 'שנה'],
        ...ACCT_COLS,
        ['chain', 'STRING', 'רשת שיווק'], ['branch', 'STRING', 'סניף'], ['city', 'STRING', 'עיר'],
        ['category', 'STRING', 'קטגוריה'], ['product', 'STRING', 'מוצר'], ['brand', 'STRING', 'מותג'],
        ['segment', 'STRING', 'בריאות / רגיל'], ['units', 'INT', 'יחידות'], ['revenue', 'NUMBER', 'הכנסות ₪'],
        ['cogs', 'NUMBER', 'עלות מכר ₪'], ['gross_profit', 'NUMBER', 'רווח גולמי ₪']
      ],
      inventory: [
        ['snapshot_date', 'STRING', 'תאריך תמונת מלאי'], ...ACCT_COLS,
        ['chain', 'STRING', 'רשת'], ['branch', 'STRING', 'סניף'], ['city', 'STRING', 'עיר'],
        ['category', 'STRING', 'קטגוריה'], ['product', 'STRING', 'מוצר'], ['brand', 'STRING', 'מותג'], ['segment', 'STRING', 'בריאות / רגיל'],
        ['stock_units', 'INT', 'יחידות במלאי'], ['avg_daily_units', 'NUMBER', 'מכירה יומית ממוצעת'],
        ['days_of_cover', 'NUMBER', 'ימי מלאי'], ['stock_value', 'NUMBER', 'שווי מלאי ₪'], ['stock_status', 'STRING', 'חוסר צפוי / תקין / עודף']
      ]
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
