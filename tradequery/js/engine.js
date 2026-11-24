/* =====================================================================
   TradeQuery AI — Local NLQ engine (Hebrew + English → SQL → insight)
   ---------------------------------------------------------------------
   A deterministic semantic parser. No data leaves the browser:
     question → parse (measure / dims / filters / time / intent)
              → SQL (AlaSQL dialect) → rows
              → viz spec + Hebrew insight + 3 follow-up questions
   Works in the browser (window.TQEngine) and in Node (globalThis).
   ===================================================================== */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- utils
  const HE = 'א-ת';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const b = (s) => `<b>${esc(s)}</b>`;
  const num = (s) => `<bdi class="num">${s}</bdi>`;

  function normalize(q) {
    return String(q || '')
      .replace(/([א-ת])['’`]/g, '$1׳')
      .replace(/([א-ת])"([א-ת])/g, '$1״$2')
      .replace(/[\u200e\u200f\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function termRegex(term) {
    return new RegExp(`(^|[^${HE}a-z0-9])([ובהלמשכ]{0,3}-?)(${reEsc(term.toLowerCase())})(?=$|[^${HE}a-z0-9])`, 'g');
  }
  function hasTerm(text, term) { return termRegex(term).test(text); }
  function anyIncl(text, list) { return list.some((k) => text.includes(k)); }
  function anyTerm(text, list) { return list.some((k) => hasTerm(text, k)); }

  // ---------------------------------------------------------- formatting
  const FMT = {
    money(v) {
      if (v == null || isNaN(v)) return '—';
      const a = Math.abs(v), s = v < 0 ? '-' : '';
      if (a >= 1e6) return s + '₪' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 2) + 'M';
      if (a >= 1e4) return s + '₪' + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
      return s + '₪' + a.toLocaleString('en-US', { maximumFractionDigits: a < 100 ? 2 : 0 });
    },
    num(v) {
      if (v == null || isNaN(v)) return '—';
      const a = Math.abs(v), s = v < 0 ? '-' : '';
      if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
      if (a >= 1e5) return s + (a / 1e3).toFixed(0) + 'K';
      return s + a.toLocaleString('en-US', { maximumFractionDigits: 1 });
    },
    pct(v) { return v == null || isNaN(v) ? '—' : (+v).toFixed(1) + '%'; },
    signedPct(v) { return v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%'; },
    pts(v) { return v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' נק׳'; },
    full(v, kind) {
      if (v == null || v === '') return '—';
      if (typeof v !== 'number') return String(v);
      if (kind === 'money') return '₪' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
      if (kind === 'money2') return '₪' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (kind === 'pct') return v.toFixed(1) + '%';
      if (kind === 'pts') return FMT.pts(v);
      return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
    }
  };

  // Column dictionary (labels + formats) for the built-in schema
  const COLS = {
    sale_month: ['חודש'], sale_quarter: ['רבעון'], sale_year: ['שנה', 'year'],
    chain: ['רשת'], branch: ['סניף'], city: ['עיר'], category: ['קטגוריה'], product: ['מוצר'], brand: ['מותג'],
    segment: ['סגמנט'], units: ['יחידות', 'num'], revenue: ['הכנסות', 'money'], cogs: ['עלות מכר', 'money'],
    gross_profit: ['רווח גולמי', 'money'], margin_pct: ['% רווח גולמי', 'pct'], avg_price: ['מחיר ממוצע', 'money2'],
    growth_pct: ['% צמיחה', 'pct'], change_pts: ['שינוי (נק׳ אחוז)', 'pts'], share_pct: ['% נתח', 'pct'],
    stock_units: ['יחידות במלאי', 'num'], avg_daily_units: ['מכירה יומית', 'num'], days_of_cover: ['ימי מלאי', 'num'],
    stock_value: ['שווי מלאי', 'money'], stock_status: ['סטטוס מלאי'], items: ['פריטים', 'num'],
    shortage_items: ['פריטים בחוסר', 'num'], excess_items: ['פריטים בעודף', 'num'], avg_days: ['ממוצע ימי מלאי', 'num'],
    snapshot_date: ['תאריך']
  };
  function colLabel(c, labels) {
    if (labels && labels[c]) return labels[c];
    if (COLS[c]) return COLS[c][0];
    const m = /^(curr|prev)_(.+)$/.exec(c);
    if (m) return (COLS[m[2]] ? COLS[m[2]][0] : m[2]) + (m[1] === 'curr' ? ' · נוכחי' : ' · קודם');
    return c;
  }
  function colKind(c) {
    if (COLS[c]) return COLS[c][1] || 'text';
    const m = /^(curr|prev)_(.+)$/.exec(c);
    if (m && COLS[m[2]]) return COLS[m[2]][1] || 'num';
    if (/pct|percent|אחוז/.test(c)) return 'pct';
    return 'num';
  }
  function fmtBy(kind, v) {
    if (kind === 'money' || kind === 'money2') return FMT.money(v);
    if (kind === 'pct') return FMT.pct(v);
    if (kind === 'pts') return FMT.pts(v);
    if (kind === 'num') return FMT.num(v);
    return v == null ? '—' : String(v);
  }

  // ------------------------------------------------------- vocabulary
  const MEASURES = {
    revenue: { col: 'revenue', he: 'הכנסות', def: 'ההכנסות', fmt: 'money' },
    units: { col: 'units', he: 'יחידות שנמכרו', def: 'היחידות שנמכרו', fmt: 'num' },
    gross_profit: { col: 'gross_profit', he: 'רווח גולמי', def: 'הרווח הגולמי', fmt: 'money' },
    cogs: { col: 'cogs', he: 'עלות מכר', def: 'עלות המכר', fmt: 'money' },
    margin_pct: { ratio: true, num: 'gross_profit', den: 'revenue', mult: 100, dec: 1, he: 'אחוז רווח גולמי', def: 'אחוז הרווח הגולמי', fmt: 'pct' },
    avg_price: { ratio: true, num: 'revenue', den: 'units', mult: 1, dec: 2, he: 'מחיר ממוצע ליחידה', def: 'המחיר הממוצע', fmt: 'money2' }
  };
  const mExpr = (k) => {
    const m = MEASURES[k];
    return m.ratio ? `ROUND(SUM(${m.num}) * ${m.mult} / NULLIF(SUM(${m.den}), 0), ${m.dec})` : `SUM(${m.col})`;
  };
  const MEASURE_KW = [
    ['margin_pct', ['אחוז רווח', 'אחוז הרווח', 'שיעור רווח', 'שיעור הרווח', 'מרווח', 'רווחיות', 'margin', '% רווח', 'אחוזי רווח']],
    ['avg_price', ['מחיר ממוצע', 'מחיר הממוצע', 'המחיר הממוצע', 'average price', 'avg price', 'מחיר ליחידה']],
    ['gross_profit', ['רווח', 'profit', 'רווחים']],
    ['cogs', ['עלות', 'עלויות', 'cost', 'cogs']],
    ['units', ['יחידות', 'כמות', 'units', 'volume', 'quantity', 'qty', 'נפח מכירות']],
    ['revenue', ['מכירות', 'הכנסות', 'הכנסה', 'פדיון', 'מחזור', 'revenue', 'sales', 'turnover']]
  ];

  const DIMS = {
    chain: { col: 'chain', sing: 'רשת', pl: 'רשתות', adj: 'מובילות', which: 'איזו', child: 'category', kwS: ['רשת', 'chain', 'retailer'], kwP: ['רשתות', 'chains', 'retailers', 'רשתות השיווק'] },
    category: { col: 'category', sing: 'קטגוריה', pl: 'קטגוריות', adj: 'מובילות', which: 'איזו', child: 'product', kwS: ['קטגוריה', 'category', 'מחלקה'], kwP: ['קטגוריות', 'categories', 'מחלקות'] },
    branch: { col: 'branch', sing: 'סניף', pl: 'סניפים', adj: 'מובילים', which: 'איזה', child: 'category', kwS: ['סניף', 'branch', 'store'], kwP: ['סניפים', 'branches', 'stores', 'חנויות'] },
    city: { col: 'city', sing: 'עיר', pl: 'ערים', adj: 'מובילות', which: 'איזו', child: 'branch', kwS: ['עיר', 'city', 'אזור'], kwP: ['ערים', 'cities', 'אזורים', 'regions'] },
    product: { col: 'product', sing: 'מוצר', pl: 'מוצרים', adj: 'מובילים', which: 'איזה', child: null, kwS: ['מוצר', 'פריט', 'מוצרי', 'product', 'item', 'sku'], kwP: ['מוצרים', 'פריטים', 'products', 'items', 'skus'] },
    brand: { col: 'brand', sing: 'מותג', pl: 'מותגים', adj: 'מובילים', which: 'איזה', child: 'product', kwS: ['מותג', 'brand'], kwP: ['מותגים', 'brands'] },
    month: { col: 'sale_month', sing: 'חודש', pl: 'חודשים', adj: 'מובילים', which: 'איזה', child: null, kwS: [], kwP: [] },
    quarter: { col: 'sale_quarter', sing: 'רבעון', pl: 'רבעונים', adj: 'מובילים', which: 'איזה', child: null, kwS: [], kwP: [] },
    segment: { col: 'segment', sing: 'סגמנט', pl: 'סגמנטים', adj: 'מובילים', which: 'איזה', child: 'category', kwS: ['סגמנט', 'segment'], kwP: ['סגמנטים', 'segments'] }
  };
  const DIM_MARKERS = ['לפי', 'איזו', 'איזה', 'אילו', 'אלו', 'מבין', 'בין ה', 'כל ה', 'כל', 'בכל', 'לכל', 'מה ה', 'מהי ה', 'מהו ה', 'which', 'what', 'by', 'per', 'each', 'top', 'every', 'across', 'among', 'המובילות', 'המובילים'];

  const KW = {
    growth: ['צמיח', 'צמחו', 'צמחה', 'צמח ', 'צומח', 'גידול', 'גדל', 'עלייה', 'עליה', 'ירידה', 'ירד', 'שינוי', 'השתנ', 'זינוק', 'קפיצה', 'התכווצ', 'growth', 'grow', 'grew', 'increase', 'decline', 'drop', 'change', 'yoy', 'qoq', 'gain'],
    decline: ['ירידה', 'ירד', 'התכווצ', 'נפל', 'decline', 'drop', 'fell', 'decrease', 'shrink'],
    trend: ['מגמ', 'לאורך זמן', 'לאורך הזמן', 'לפי חודש', 'לפי חודשים', 'חודש אחר חודש', 'רבעוני', 'לפי רבעון', 'לפי רבעונים', 'היסטור', 'התפתח', 'עונתיות', 'trend', 'over time', 'monthly', 'by month', 'quarterly', 'by quarter', 'timeline', 'time series', 'seasonal'],
    quarterly: ['רבעוני', 'לפי רבעון', 'לפי רבעונים', 'quarterly', 'by quarter'],
    share: ['נתח', 'התפלגות', 'חלוקה', 'פילוח', 'אחוז מסך', 'חלק מה', 'share', 'distribution', 'breakdown', 'mix', 'split'],
    table: ['פירוט', 'טבלה', 'רשימה', 'רשימת', 'table', 'list', 'detail'],
    compare: ['השווה', 'השוואה', 'לעומת', 'מול', 'compare', ' vs', 'versus'],
    lowest: ['הנמוך', 'הנמוכה', 'הנמוכים', 'הנמוכות', 'הכי פחות', 'הגרוע', 'הכי חלש', 'החלש', 'החלשים', 'החלשות', 'lowest', 'worst', 'bottom', 'least', 'weakest', 'smallest'],
    inventory: ['מלאי', 'inventory', 'stock', 'חוסר', 'חוסרים', 'עודף', 'ימי כיסוי', 'days of cover', 'out of stock', 'stockout'],
    shortage: ['חוסר', 'חוסרים', 'חסר', 'נגמר', 'אזל', 'shortage', 'out of stock', 'stockout', 'low stock', 'בסיכון', 'סכנת'],
    excess: ['עודף', 'עודפי', 'overstock', 'excess', 'תקוע', 'slow moving'],
    yoy: ['אשתקד', 'שנה שעברה', 'השנה הקודמת', 'שנה קודמת', 'yoy', 'year over year', 'year-over-year', 'last year', 'שנתית', 'שנה מול שנה'],
    health: ['בריאות', 'בריאים', 'בריא', 'health', 'healthy', 'אורגני', 'organic'],
    regular: ['רגילים', 'רגיל', 'רגילות', 'regular', 'standard', 'conventional', 'השאר'],
    cont: ['ומה', 'ומ ה', 'ואם', 'and what', 'what about', 'how about', 'and for', 'ובנוגע', 'ולגבי', 'ומה לגבי', 'עכשיו ל', 'אותו דבר']
  };
  const WORD_NUM = { 'שלושת': 3, 'שלושה': 3, 'שלוש': 3, 'ארבעת': 4, 'חמשת': 5, 'חמישה': 5, 'חמש': 5, 'עשרת': 10, 'עשרה': 10, 'שבעת': 7, 'three': 3, 'five': 5, 'ten': 10 };
  const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const HE_MONTHS_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
  const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const HE_ORD = { 'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4 };

  // ---------------------------------------------------------- time
  const qLabel = (q, plain) => { const [y, n] = q.split('-'); return plain ? `${n} ${y}` : `\u2068${n} ${y}\u2069`; };
  const mLabel = (ym) => { const [y, m] = ym.split('-'); return `${HE_MONTHS_SHORT[+m - 1]} ${y}`; };
  const ymAdd = (ym, k) => { let [y, m] = ym.split('-').map(Number); m += k; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
  const qAdd = (q, k) => { let [y, n] = q.split('-Q').map(Number); n += k; while (n < 1) { n += 4; y--; } while (n > 4) { n -= 4; y++; } return `${y}-Q${n}`; };

  function createEngine(alasql) {
    const ctx = { meta: null, last: null, mode: 'builtin', generic: null };

    // ------------------------------------------------------ metadata
    function loadMeta() {
      const distinct = (col) => alasql(`SELECT DISTINCT ${col} AS v FROM sales ORDER BY v`).map((r) => r.v);
      const months = distinct('sale_month');
      const quarters = distinct('sale_quarter');
      const years = distinct('sale_year');
      const values = [];
      const D = global.TQData || {};
      const prodAlias = {}; (D.PRODUCTS || []).forEach((p) => { prodAlias[p.name] = p.alias || []; });
      const chainAlias = {}; (D.CHAINS || []).forEach((c) => { chainAlias[c.name] = c.en || []; });
      const add = (dim, value, extra) => [value, ...(extra || [])].forEach((t) => values.push({ dim, value, term: t.toLowerCase() }));
      distinct('chain').forEach((v) => add('chain', v, chainAlias[v]));
      distinct('category').forEach((v) => add('category', v, (D.CATEGORY_EN || {})[v]));
      add('category', 'מוצרי חלב', ['חלב']);
      distinct('city').forEach((v) => add('city', v, (D.CITY_EN || {})[v]));
      distinct('branch').forEach((v) => add('branch', v));
      distinct('product').forEach((v) => add('product', v, prodAlias[v]));
      distinct('brand').forEach((v) => add('brand', v));
      values.sort((a, b2) => b2.term.length - a.term.length);
      ctx.meta = {
        months, quarters, years, values,
        lastMonth: months[months.length - 1], lastQuarter: quarters[quarters.length - 1], lastYear: years[years.length - 1],
        rows: alasql('SELECT COUNT(*) AS n FROM sales')[0].n
      };
      return ctx.meta;
    }

    // Period helpers ---------------------------------------------------
    function P_quarter(q) { return { kind: 'quarter', key: q, label: qLabel(q), cond: `sale_quarter = '${q}'`, phrase: `ב-${qLabel(q, true)}` }; }
    function P_month(ym) { return { kind: 'month', key: ym, label: mLabel(ym), cond: `sale_month = '${ym}'`, phrase: `ב${HE_MONTHS[+ym.split('-')[1] - 1]} ${ym.split('-')[0]}` }; }
    function P_range(from, to, n) {
      return { kind: 'range', n, from, to, label: `${mLabel(from)} – ${mLabel(to)}`, cond: `sale_month >= '${from}' AND sale_month <= '${to}'`, phrase: n ? `ב-${n} החודשים האחרונים` : '' };
    }
    function P_year(y, alignTo) {
      const M = ctx.meta;
      if (alignTo) {
        const to = `${y}-${alignTo}`;
        return { kind: 'year', key: y, label: `${HE_MONTHS_SHORT[0]}–${HE_MONTHS_SHORT[+alignTo - 1]} ${y}`, cond: `sale_year = ${y} AND sale_month <= '${to}'`, phrase: `ב-${y}` };
      }
      const partial = String(y) === String(M.lastYear) && !M.lastMonth.endsWith('-12');
      const first = M.months[0].startsWith(String(y)) && !M.months[0].endsWith('-01');
      return { kind: 'year', key: y, label: `${y}${partial ? ' (עד ' + HE_MONTHS_SHORT[+M.lastMonth.split('-')[1] - 1] + ')' : first ? ' (חלקי)' : ''}`, cond: `sale_year = ${y}`, phrase: `ב-${y}` };
    }

    function previousOf(p, yoy) {
      const M = ctx.meta;
      if (p.kind === 'quarter') return P_quarter(yoy ? qAdd(p.key, -4) : qAdd(p.key, -1));
      if (p.kind === 'month') return P_month(yoy ? ymAdd(p.key, -12) : ymAdd(p.key, -1));
      if (p.kind === 'range') {
        const len = monthsBetween(p.from, p.to);
        return yoy ? P_range(ymAdd(p.from, -12), ymAdd(p.to, -12)) : P_range(ymAdd(p.from, -len), ymAdd(p.from, -1));
      }
      if (p.kind === 'year') {
        const lastM = String(p.key) === String(M.lastYear) ? M.lastMonth.split('-')[1] : '12';
        return { cur: P_year(p.key, lastM === '12' ? null : lastM), prev: P_year(p.key - 1, lastM === '12' ? null : lastM) };
      }
      return null;
    }
    const monthsBetween = (a, z) => { const [y1, m1] = a.split('-').map(Number); const [y2, m2] = z.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; };

    function parseTime(t) {
      const M = ctx.meta;
      const out = { period: null, yoy: anyIncl(t, KW.yoy), phrases: [] };
      let m;
      // explicit quarter
      if ((m = /q([1-4])\s*[-/ ]?\s*(20\d{2})?/i.exec(t)) || (m = /(20\d{2})\s*[-/ ]?\s*q([1-4])/i.exec(t))) {
        let qn, y;
        if (/^q/i.test(m[0])) { qn = m[1]; y = m[2]; } else { y = m[1]; qn = m[2]; }
        if (!y) y = [...M.quarters].reverse().find((q) => q.endsWith('Q' + qn))?.split('-')[0];
        if (M.quarters.includes(`${y}-Q${qn}`)) out.period = P_quarter(`${y}-Q${qn}`);
      }
      if (!out.period && (m = new RegExp(`רבעון\\s*(?:ה)?(ראשון|שני|שלישי|רביעי|[1-4])(?![${HE}])\\s*(?:של\\s*|ב-?|,\\s*|-)?\\s*(20\\d{2})?`).exec(t))) {
        const qn = HE_ORD[m[1]] || +m[1];
        const y = m[2] || [...M.quarters].reverse().find((q) => q.endsWith('Q' + qn))?.split('-')[0];
        if (M.quarters.includes(`${y}-Q${qn}`)) out.period = P_quarter(`${y}-Q${qn}`);
      }
      if (!out.period && anyIncl(t, ['רבעון האחרון', 'רבעון אחרון', 'last quarter', 'latest quarter', 'this quarter', 'הרבעון הנוכחי', 'current quarter', 'recent quarter']))
        out.period = P_quarter(M.lastQuarter);
      // month names
      if (!out.period) {
        for (let i = 0; i < 12; i++) {
          const re = new RegExp(`(?:${HE_MONTHS[i]}|${EN_MONTHS[i]})\\s*(20\\d{2})?`, 'i');
          const mm = re.exec(t);
          if (mm && (hasTerm(t, HE_MONTHS[i]) || new RegExp(`\\b${EN_MONTHS[i]}\\b`, 'i').test(t))) {
            const mo = String(i + 1).padStart(2, '0');
            const y = mm[1] || [...M.months].reverse().find((x) => x.endsWith('-' + mo))?.split('-')[0];
            if (M.months.includes(`${y}-${mo}`)) { out.period = P_month(`${y}-${mo}`); break; }
          }
        }
      }
      // last N months
      if (!out.period) {
        let n = null;
        if ((m = /(\d{1,2})\s*(?:ה)?חודשים\s*(?:ה)?אחרונים/.exec(t)) || (m = /last\s*(\d{1,2})\s*months/i.exec(t)) || (m = /(\d{1,2})\s*(?:ה)?חודשים/.exec(t))) n = +m[1];
        else if (anyIncl(t, ['חצי שנה', 'חצי השנה', 'half year', 'half-year', 'last six months'])) n = 6;
        else if (anyIncl(t, ['שנה האחרונה', 'שנה אחרונה', 'last 12 months', 'past year', 'trailing 12', '12 החודשים'])) n = 12;
        else if (anyIncl(t, ['החודש האחרון', 'חודש אחרון', 'last month', 'latest month', 'החודש הנוכחי', 'this month'])) out.period = P_month(M.lastMonth);
        else if (anyIncl(t, ['שלושה חודשים', '3 חודשים', 'last three months'])) n = 3;
        if (n && n > 0 && n <= M.months.length) out.period = P_range(ymAdd(M.lastMonth, -(n - 1)), M.lastMonth, n);
      }
      // explicit year
      if (!out.period && (m = /(?:^|[^0-9])(20\d{2})(?![0-9])/.exec(t)) && M.years.map(String).includes(m[1])) out.period = P_year(+m[1]);
      if (!out.period && new RegExp(`(^|[^${HE}])[בוש]?השנה(?![${HE}])(?!\\s*(שעברה|הקודמת))`).test(t)) out.period = P_year(+M.lastYear);
      if (!out.period && /this year|ytd/i.test(t)) out.period = P_year(+M.lastYear);
      return out;
    }

    // ------------------------------------------------------ parse
    function parse(raw) {
      const M = ctx.meta;
      const q = normalize(raw);
      let t = ' ' + q.toLowerCase() + ' ';
      const p = { q, filters: {}, dims: [], measure: null, intent: null, order: 'DESC', topN: null, time: null, flags: {} };

      // 1) entity values (longest first) → filters; blank them out
      const TOK = { chain: 'α', category: 'β', city: 'γ', branch: 'δ', product: 'ε', brand: 'ζ', segment: 'η' };
      const found = {};
      M.values.forEach((v) => {
        const re = termRegex(v.term);
        if (re.test(t)) {
          t = t.replace(termRegex(v.term), (all, pre) => `${pre}§${TOK[v.dim]}§`);
          (found[v.dim] = found[v.dim] || new Set()).add(v.value);
        }
      });
      Object.keys(found).forEach((d) => { p.filters[d] = [...found[d]]; });

      // 2) segment (health vs regular)
      const hasHealth = anyTerm(t, KW.health), hasRegular = anyTerm(t, KW.regular);
      if (hasHealth && hasRegular) p.flags.segmentCompare = true;
      else if (hasHealth && anyIncl(t, KW.compare)) p.flags.segmentCompare = true;
      else if (hasHealth) p.filters.segment = ['בריאות'];
      else if (hasRegular && /מוצרים?\s*ה?רגיל/.test(t)) p.filters.segment = ['רגיל'];
      [...KW.health, ...KW.regular].forEach((k) => { t = t.replace(termRegex(k), (a, pre) => `${pre}§η§`); });

      // remove "<dim word> <value>" pairs (e.g. "ברשת סופר גל") so they don't become group-bys
      Object.entries(DIMS).forEach(([key, d]) => {
        [...d.kwS, ...d.kwP].forEach((w) => {
          t = t.replace(new RegExp(`([ובהלמשכ]{0,3}${reEsc(w)})\\s*(ה)?(§${TOK[key]}§)`, 'g'), ' $3');
        });
      });
      // "which month / quarter" → rank by a time bucket
      let timeDim = null;
      if (/(איזה|באיזה|באילו|אילו|which|what)\s*(ה)?(חודש|month)/.test(t)) timeDim = 'month';
      else if (/(איזה|באיזה|באילו|אילו|which|what)\s*(ה)?(רבעון|quarter)/.test(t)) timeDim = 'quarter';

      // 3) time
      const tm = parseTime(t);
      p.time = tm.period; p.flags.yoy = tm.yoy;

      // 4) measure
      const isInv = anyIncl(t, KW.inventory);
      for (const [k, list] of MEASURE_KW) { if (anyIncl(t, list)) { p.measure = k; break; } }

      // 5) dimensions (scored)
      const scores = {};
      Object.entries(DIMS).forEach(([key, d]) => {
        const check = (w, base) => {
          const re = termRegex(w); let mm;
          while ((mm = re.exec(t))) {
            const before = t.slice(Math.max(0, mm.index - 14), mm.index + mm[1].length + mm[2].length);
            const after = t.slice(mm.index + mm[0].length, mm.index + mm[0].length + 14);
            let s = base;
            if (DIM_MARKERS.some((mk) => before.includes(mk + ' ') || before.endsWith(mk) || before.includes(mk + '-')) || /^\s*(ה)?(מוביל|הכי|ביותר|top)/.test(after)) s += 3;
            if (/לפי\s*$/.test(before) || (/[בל]$/.test(mm[2]) && /(לפי|by|per)\s*$/.test(before.slice(0, -1)))) s += 1;
            scores[key] = Math.max(scores[key] || 0, s);
          }
        };
        d.kwP.forEach((w) => check(w, 2));
        d.kwS.forEach((w) => check(w, 1));
      });
      // two+ explicit values of one dim → compare across them
      Object.entries(p.filters).forEach(([d, vals]) => { if (vals.length >= 2 && DIMS[d]) scores[d] = Math.max(scores[d] || 0, 3); });
      let dims = Object.entries(scores).filter(([, s]) => s >= 2).sort((a, z) => z[1] - a[1]).map(([k]) => k);
      if (p.flags.segmentCompare) {
        const strong = dims.filter((d) => scores[d] >= 4 && d !== 'segment');
        dims = [...strong.slice(0, 1), 'segment'];
      }
      if (timeDim) dims = [timeDim, ...dims.filter((d) => d !== timeDim)];
      p.dims = dims.slice(0, 2);
      p.dimScores = scores;

      // 6) topN + order
      let m;
      if ((m = /(?:top|טופ)\s*(\d{1,2})/i.exec(t)) || (m = /(\d{1,2})\s*(?:ה)?(?:מוצרים|סניפים|רשתות|קטגוריות|מותגים|ערים|פריטים|products|branches|items|brands|stores|categories|chains)/i.exec(t))) p.topN = +m[1];
      else Object.entries(WORD_NUM).forEach(([w, n]) => { if (hasTerm(t, w)) p.topN = n; });
      if (anyIncl(t, KW.lowest)) p.order = 'ASC';

      // 7) intent
      const g = anyIncl(t, KW.growth), sh = anyIncl(t, KW.share);
      const tr = !timeDim && (anyIncl(t, KW.trend) || anyTerm(t, ['חודשי', 'חודשית', 'חודשיים']));
      if (isInv && !g) {
        p.intent = 'inventory';
        p.inv = anyIncl(t, KW.shortage) ? 'shortage' : anyIncl(t, KW.excess) ? 'excess' : 'overview';
        p.invMeasure = anyIncl(t, ['יחידות', 'units']) ? 'stock_units' : anyIncl(t, ['ימי', 'days']) ? 'avg_days' : 'stock_value';
      } else if (g && (!tr || (p.dims.length && (scores[p.dims[0]] || 0) >= 4) || tm.yoy)) {
        p.intent = 'growth';
        if (anyIncl(t, KW.decline) && !anyIncl(t, ['צמיח', 'גידול', 'growth'])) p.order = 'ASC';
      } else if (tr) {
        p.intent = 'trend';
        p.grain = anyIncl(t, KW.quarterly) ? 'quarter' : 'month';
      } else if (sh && p.dims.length) p.intent = 'share';
      else if (p.flags.segmentCompare || p.dims.length) p.intent = 'rank';
      else if (Object.keys(p.filters).length || p.measure || p.time || anyIncl(t, ['כמה', 'סה״כ', 'סה"כ', 'סך', 'total', 'how much', 'how many', 'overall'])) p.intent = 'total';
      p.flags.table = anyIncl(t, KW.table);
      p.flags.cont = KW.cont.some((k) => t.trimStart().startsWith(k + ' ') || t.trimStart().startsWith(k));
      p.flags.signals = !!(p.measure || p.dims.length || g || tr || sh || isInv || p.flags.segmentCompare);
      if (p.intent === 'share' && MEASURES[p.measure || 'revenue'].ratio) p.intent = 'rank';
      if (!p.measure) p.measure = 'revenue';
      return p;
    }

    // Merge a follow-up like "ומה לגבי רשת פרש פוינט?" into the previous question
    function mergeWithLast(p) {
      const L = ctx.last;
      if (!L || L.intent === 'help') return p;
      const merged = JSON.parse(JSON.stringify(L));
      merged.q = p.q;
      Object.entries(p.filters).forEach(([d, v]) => {
        merged.filters[d] = v;
        const i = merged.dims.indexOf(d);
        if (i >= 0 && v.length === 1) { // filtering on the grouped dimension → drill one level down
          const child = DIMS[d].child;
          if (child && !merged.dims.includes(child)) merged.dims[i] = child; else merged.dims.splice(i, 1);
        }
      });
      if (!merged.dims.length && ['rank', 'share'].includes(merged.intent)) merged.intent = 'total';
      if (p.time) merged.time = p.time;
      if (p.measure && p.measure !== 'revenue') merged.measure = p.measure;
      if (p.dims.length) merged.dims = p.dims;
      merged.flags.merged = true;
      return merged;
    }

    // ------------------------------------------------------ SQL building
    function whereParts(p, opts) {
      const parts = [];
      Object.entries(p.filters).forEach(([d, vals]) => {
        const col = DIMS[d] ? DIMS[d].col : d;
        if (opts && opts.skipDim === d && vals.length > 1) { parts.push(`${col} IN (${vals.map(sq).join(', ')})`); return; }
        parts.push(vals.length === 1 ? `${col} = ${sq(vals[0])}` : `${col} IN (${vals.map(sq).join(', ')})`);
      });
      return parts;
    }
    const W = (parts) => (parts.length ? '\nWHERE ' + parts.join('\n  AND ') : '');

    function filterPhrase(p) {
      const parts = [];
      Object.entries(p.filters).forEach(([d, vals]) => {
        if (d === 'segment') { parts.push(vals[0] === 'בריאות' ? 'מוצרי בריאות' : 'מוצרים רגילים'); return; }
        const dd = DIMS[d];
        parts.push(vals.length > 1 ? `${dd.pl}: ${vals.join(', ')}` : `${dd.sing} ${vals[0]}`);
      });
      return parts;
    }

    function build(p) {
      const M = ctx.meta;
      const meas = MEASURES[p.measure];
      const dimCols = p.dims.map((d) => DIMS[d].col);
      const R = { sql: '', viz: {}, aux: {} };
      const extraCols = (skip) => ['revenue', 'gross_profit', 'margin_pct', 'units']
        .filter((k) => k !== skip).map((k) => `  ${mExpr(k)} AS ${k}`);

      if (p.intent === 'inventory') return buildInventory(p);

      if (p.intent === 'growth') {
        let cur = p.time, prev;
        if (!cur) cur = P_quarter(M.lastQuarter);
        if (cur.kind === 'year') { const pr = previousOf(cur); cur = pr.cur; prev = pr.prev; } else prev = previousOf(cur, p.flags.yoy);
        R.aux.cur = cur; R.aux.prev = prev;
        const cs = (cond, col) => `SUM(CASE WHEN ${cond} THEN ${col} ELSE 0 END)`;
        let sel, sortCol;
        if (!meas.ratio) {
          const c = cs(cur.cond, meas.col), v = cs(prev.cond, meas.col);
          sel = [`  ${c} AS curr_${p.measure}`, `  ${v} AS prev_${p.measure}`, `  ROUND((${c} / NULLIF(${v}, 0) - 1) * 100, 1) AS growth_pct`];
          sortCol = 'growth_pct';
        } else {
          const r = (cond) => `ROUND(${cs(cond, meas.num)} * ${meas.mult} / NULLIF(${cs(cond, meas.den)}, 0), ${meas.dec})`;
          if (meas.fmt === 'pct') {
            sel = [`  ${r(cur.cond)} AS curr_${p.measure}`, `  ${r(prev.cond)} AS prev_${p.measure}`, `  ROUND(${r(cur.cond)} - ${r(prev.cond)}, ${meas.dec}) AS change_pts`];
            sortCol = 'change_pts';
          } else {
            sel = [`  ${r(cur.cond)} AS curr_${p.measure}`, `  ${r(prev.cond)} AS prev_${p.measure}`, `  ROUND((${r(cur.cond)} / NULLIF(${r(prev.cond)}, 0) - 1) * 100, 1) AS growth_pct`];
            sortCol = 'growth_pct';
          }
        }
        const wp = [...whereParts(p), `((${cur.cond}) OR (${prev.cond}))`];
        const limit = p.topN || (dimCols.some((c) => c === 'product' || c === 'branch') ? 12 : null);
        R.sql = `-- צמיחה: ${cur.label} לעומת ${prev.label}\nSELECT${dimCols.length ? '\n  ' + dimCols.join(',\n  ') + ',' : ''}\n${sel.join(',\n')}\nFROM sales${W(wp)}` +
          (dimCols.length ? `\nGROUP BY ${dimCols.join(', ')}\nORDER BY ${sortCol} ${p.order}${limit ? `\nLIMIT ${limit}` : ''}` : '');
        R.viz = dimCols.length
          ? { type: dimCols.length === 2 ? 'table' : 'bar', x: dimCols[0], y: [sortCol], sign: true, horizontal: true }
          : { type: 'kpi', y: [`curr_${p.measure}`, `prev_${p.measure}`, sortCol] };
        return R;
      }

      if (p.intent === 'trend') {
        const tcol = p.grain === 'quarter' ? 'sale_quarter' : 'sale_month';
        const series = p.dims[0] || null;
        const wp = whereParts(p);
        if (p.time) wp.push(p.time.kind === 'year' || p.time.kind === 'range' || p.time.kind === 'quarter' ? `(${p.time.cond})` : `(${p.time.cond})`);
        let note = '';
        if (series) {
          const scol = DIMS[series].col;
          const cnt = alasql(`SELECT COUNT(DISTINCT ${scol}) AS n FROM sales${W(wp)}`)[0].n;
          if (cnt > 6) {
            const top = alasql(`SELECT ${scol} AS v, ${mExpr(p.measure)} AS m FROM sales${W(wp)} GROUP BY ${scol} ORDER BY m DESC LIMIT 5`).map((r) => r.v);
            wp.push(`${scol} IN (${top.map(sq).join(', ')})`);
            note = `-- מוצגות 5 הסדרות המובילות מתוך ${cnt}\n`;
          }
        }
        R.sql = `${note}SELECT\n  ${tcol},${series ? '\n  ' + DIMS[series].col + ',' : ''}\n  ${mExpr(p.measure)} AS ${p.measure}\nFROM sales${W(wp)}\nGROUP BY ${tcol}${series ? ', ' + DIMS[series].col : ''}\nORDER BY ${tcol}`;
        R.viz = { type: 'line', x: tcol, y: [p.measure], series: series ? DIMS[series].col : null };
        return R;
      }

      const wp = whereParts(p);
      if (p.time) wp.push(`(${p.time.cond})`);

      if (p.intent === 'total') {
        R.sql = `SELECT\n  ${mExpr(p.measure)} AS ${p.measure},\n${extraCols(p.measure).join(',\n')}\nFROM sales${W(wp)}`;
        R.viz = { type: 'kpi', y: [p.measure, ...['revenue', 'gross_profit', 'margin_pct', 'units'].filter((k) => k !== p.measure)] };
        return R;
      }

      if (p.intent === 'share') {
        const sub = `(SELECT ${mExpr(p.measure)} FROM sales${W(wp).replace(/\n/g, ' ')})`;
        R.sql = `SELECT\n  ${dimCols.join(',\n  ')},\n  ${mExpr(p.measure)} AS ${p.measure},\n  ROUND(${mExpr(p.measure)} * 100 / ${sub}, 1) AS share_pct\nFROM sales${W(wp)}\nGROUP BY ${dimCols.join(', ')}\nORDER BY ${p.measure} DESC${p.topN ? `\nLIMIT ${p.topN}` : ''}`;
        R.viz = dimCols.length === 1 ? { type: 'doughnut', x: dimCols[0], y: [p.measure] } : { type: 'table' };
        return R;
      }

      // rank (also segment comparison)
      const limit = p.topN || (dimCols.some((c) => c === 'product' || c === 'branch') && !p.flags.table ? 10 : null);
      R.sql = `SELECT\n  ${dimCols.join(',\n  ')},\n  ${mExpr(p.measure)} AS ${p.measure},\n${extraCols(p.measure).join(',\n')}\nFROM sales${W(wp)}\nGROUP BY ${dimCols.join(', ')}\nORDER BY ${dimCols.length === 2 && dimCols[1] === 'segment' ? dimCols[0] + ', segment' : p.measure + ' ' + p.order}${limit && dimCols.length === 1 ? `\nLIMIT ${limit}` : ''}`;
      if (dimCols.length === 2) R.viz = { type: 'bar', x: dimCols[0], y: [p.measure], series: dimCols[1] };
      else if (dimCols[0] === 'segment') R.viz = { type: 'bar', x: 'segment', y: [p.measure === 'gross_profit' ? 'margin_pct' : p.measure] };
      else R.viz = { type: p.flags.table ? 'table' : 'bar', x: dimCols[0], y: [p.measure], highlight: true };
      return R;
    }

    function buildInventory(p) {
      const R = { sql: '', viz: {}, aux: {} };
      const wp = whereParts(p);
      let dim = p.dims.find((d) => d !== 'segment' || p.flags.segmentCompare);
      if ((p.inv === 'shortage' || p.inv === 'excess') && (dim === 'product' || dim === 'branch')) dim = null;
      const dcol = dim ? DIMS[dim].col : null;
      if (dcol) {
        const sortBy = p.inv === 'shortage' ? 'shortage_items' : p.inv === 'excess' ? 'excess_items' : p.invMeasure;
        R.sql = `-- תמונת מלאי נכון ל-30/09/2026\nSELECT\n  ${dcol},\n  COUNT(*) AS items,\n  SUM(CASE WHEN stock_status = 'חוסר צפוי' THEN 1 ELSE 0 END) AS shortage_items,\n  SUM(CASE WHEN stock_status = 'עודף' THEN 1 ELSE 0 END) AS excess_items,\n  SUM(stock_value) AS stock_value,\n  ROUND(AVG(days_of_cover), 1) AS avg_days\nFROM inventory${W(wp)}\nGROUP BY ${dcol}\nORDER BY ${sortBy} DESC${p.topN ? `\nLIMIT ${p.topN}` : ''}`;
        R.viz = { type: 'bar', x: dcol, y: [sortBy], horizontal: true, highlight: true };
        R.aux.inv = p.inv; R.aux.sortBy = sortBy;
        return R;
      }
      if (p.inv === 'shortage' || p.inv === 'excess') {
        const cond = p.inv === 'shortage' ? 'days_of_cover < 7' : 'days_of_cover > 60';
        R.sql = `-- ${p.inv === 'shortage' ? 'פריטים בסיכון חוסר (פחות מ-7 ימי מלאי)' : 'פריטים בעודף מלאי (מעל 60 ימי מלאי)'}\nSELECT\n  chain,\n  branch,\n  product,\n  category,\n  stock_units,\n  avg_daily_units,\n  days_of_cover,\n  stock_value\nFROM inventory${W([...wp, cond])}\nORDER BY ${p.inv === 'shortage' ? 'days_of_cover ASC' : 'stock_value DESC'}${p.topN ? `\nLIMIT ${p.topN}` : ''}`;
        R.viz = { type: 'table' };
        R.aux.inv = p.inv;
        return R;
      }
      R.sql = `-- סיכום מלאי לפי סטטוס\nSELECT\n  stock_status,\n  COUNT(*) AS items,\n  SUM(stock_units) AS stock_units,\n  SUM(stock_value) AS stock_value,\n  ROUND(AVG(days_of_cover), 1) AS avg_days\nFROM inventory${W(wp)}\nGROUP BY stock_status\nORDER BY stock_value DESC`;
      R.viz = { type: 'doughnut', x: 'stock_status', y: ['stock_value'] };
      R.aux.inv = 'overview';
      return R;
    }

    // ------------------------------------------------------ insights
    const sum = (rows, c) => rows.reduce((a, r) => a + (+r[c] || 0), 0);

    function insight(p, R, rows) {
      if (!rows.length) return { headline: 'לא נמצאו נתונים התואמים לשאלה', bullets: ['נסו להרחיב את טווח הזמן או להסיר מסננים.'] };
      const meas = MEASURES[p.measure];
      const f = (v) => num(fmtBy(meas.fmt, v));
      const scope = [p.time ? p.time.phrase : '', ...filterPhrase(p)].filter(Boolean).join(' · ');
      const dim = p.dims[0] ? DIMS[p.dims[0]] : null;
      const x = R.viz.x;

      if (p.intent === 'inventory') return invInsight(p, R, rows);

      if (p.intent === 'growth') {
        const { cur, prev } = R.aux;
        const PTS = meas.fmt === 'pct';
        const key = PTS ? 'change_pts' : 'growth_pct';
        const fmtG = (v) => num(PTS ? FMT.pts(v) : FMT.signedPct(v));
        if (!x) {
          const r = rows[0];
          return {
            headline: `${meas.he} ${cur.label}: ${f(r['curr_' + p.measure])} — ${fmtG(r[key])} לעומת ${esc(prev.label)}`,
            bullets: [`בתקופה המקבילה (${esc(prev.label)}) נרשמו ${f(r['prev_' + p.measure])}.`, scope ? `היקף הניתוח: ${esc(scope)}` : 'הניתוח כולל את כל הרשתות והקטגוריות.']
          };
        }
        const valid = rows.filter((r) => r[key] != null);
        const top = valid[0], bot = valid[valid.length - 1];
        const up = valid.filter((r) => r[key] > 0).length;
        const bullets = [];
        if (!meas.ratio) bullets.push(`${b(top[x])}: מ-${f(top['prev_' + p.measure])} ל-${f(top['curr_' + p.measure])} (${esc(cur.label)} לעומת ${esc(prev.label)}).`);
        else bullets.push(`${b(top[x])}: מ-${f(top['prev_' + p.measure])} ל-${f(top['curr_' + p.measure])}.`);
        bullets.push(`${num(up)} מתוך ${num(valid.length)} ${esc(dim.pl)} ${meas.ratio ? 'שיפרו את הרווחיות' : 'הציגו צמיחה'}; ${p.order === 'ASC' ? 'הביצוע הטוב ביותר' : 'החלשה ביותר'}: ${b(bot[x])} (${fmtG(bot[key])}).`);
        if (!meas.ratio) {
          const tc = sum(rows, 'curr_' + p.measure), tp = sum(rows, 'prev_' + p.measure);
          if (tp) bullets.push(`סה״כ ${esc(meas.he)} ב${rows.length < valid.length + 1 && p.topN ? 'פריטים המוצגים' : 'היקף הניתוח'}: ${num(FMT.signedPct((tc / tp - 1) * 100))}${scope ? ' · ' + esc(scope) : ''}.`);
        }
        return {
          headline: p.order === 'ASC'
            ? (top[key] < 0 ? `הירידה החדה ביותר: ${b(top[x])} (${fmtG(top[key])})` : `אין ירידות — הצמיחה החלשה ביותר: ${b(top[x])} (${fmtG(top[key])})`)
            : top[key] < 0
              ? `כל ה${esc(dim.pl)} ירדו; הירידה המתונה ביותר: ${b(top[x])} (${fmtG(top[key])})`
              : `${PTS ? 'השיפור החד ביותר ב' + esc(meas.he) : 'הצמיחה החזקה ביותר'}: ${b(top[x])} (${fmtG(top[key])})`,
          bullets
        };
      }

      if (p.intent === 'trend') {
        const tcol = R.viz.x, s = R.viz.series;
        const periods = [...new Set(rows.map((r) => r[tcol]))];
        const fp = periods[0], lp = periods[periods.length - 1];
        const lab = (k) => (/Q/.test(k) ? qLabel(k) : mLabel(k));
        if (!s) {
          const first = rows[0][p.measure], last = rows[rows.length - 1][p.measure];
          const peak = rows.reduce((a, r) => (r[p.measure] > a[p.measure] ? r : a), rows[0]);
          const low = rows.reduce((a, r) => (r[p.measure] < a[p.measure] ? r : a), rows[0]);
          const ch = meas.fmt === 'pct' ? FMT.pts(last - first) : FMT.signedPct((last / first - 1) * 100);
          const bullets = [`שיא: ${b(lab(peak[tcol]))} עם ${f(peak[p.measure])}; שפל: ${b(lab(low[tcol]))} עם ${f(low[p.measure])}.`];
          if (rows.length >= 13 && tcol === 'sale_month') {
            const yo = rows[rows.length - 13][p.measure];
            bullets.push(`${esc(lab(lp))} לעומת החודש המקביל אשתקד: ${num(meas.fmt === 'pct' ? FMT.pts(last - yo) : FMT.signedPct((last / yo - 1) * 100))}.`);
          }
          if (!meas.ratio) bullets.push(`ממוצע ל${tcol === 'sale_month' ? 'חודש' : 'רבעון'}: ${f(sum(rows, p.measure) / rows.length)}${scope ? ' · ' + esc(scope) : ''}.`);
          return { headline: `${esc(meas.he)}: ${num(ch)} בין ${esc(lab(fp))} ל-${esc(lab(lp))}`, bullets };
        }
        const groups = {};
        rows.forEach((r) => { (groups[r[s]] = groups[r[s]] || []).push(r); });
        const stats = Object.entries(groups).map(([k, rs]) => {
          const n = Math.min(3, Math.floor(rs.length / 2)) || 1;
          const a = rs.slice(0, n).reduce((x2, r) => x2 + r[p.measure], 0) / n;
          const z = rs.slice(-n).reduce((x2, r) => x2 + r[p.measure], 0) / n;
          return { k, ch: meas.fmt === 'pct' ? z - a : (z / a - 1) * 100, tot: rs.reduce((x2, r) => x2 + r[p.measure], 0) };
        }).sort((a, z) => z.ch - a.ch);
        const fmtc = (v) => num(meas.fmt === 'pct' ? FMT.pts(v) : FMT.signedPct(v));
        const biggest = [...stats].sort((a, z) => z.tot - a.tot)[0];
        return {
          headline: `${b(stats[0].k)} מציגה את המגמה החזקה ביותר (${fmtc(stats[0].ch)})`,
          bullets: [
            `השוואת ${n3(tcol)} הראשונים מול האחרונים בתקופה (${esc(lab(fp))} → ${esc(lab(lp))}).`,
            `המגמה החלשה ביותר: ${b(stats[stats.length - 1].k)} (${fmtc(stats[stats.length - 1].ch)}).`,
            meas.ratio ? `נבחנו ${num(stats.length)} סדרות${scope ? ' · ' + esc(scope) : ''}.` : `הגדולה ביותר בהיקף: ${b(biggest.k)} עם ${f(biggest.tot)} מצטבר.`
          ]
        };
      }

      if (dim && R.viz.series === 'segment') {
        // segment comparison by another dimension
        const by = {};
        rows.forEach((r) => { (by[r[x]] = by[r[x]] || {})[r.segment] = r; });
        const diffs = Object.entries(by).filter(([, v]) => v['בריאות'] && v['רגיל']).map(([k, v]) => ({ k, d: v['בריאות'].margin_pct - v['רגיל'].margin_pct }))
          .sort((a, z) => z.d - a.d);
        return {
          headline: `פער הרווחיות לטובת מוצרי הבריאות הגבוה ביותר: ${b(diffs[0].k)} (${num(FMT.pts(diffs[0].d))})`,
          bullets: [`הפער הנמוך ביותר: ${b(diffs[diffs.length - 1].k)} (${num(FMT.pts(diffs[diffs.length - 1].d))}).`, `המדד המוצג: ${esc(meas.he)}${scope ? ' · ' + esc(scope) : ''}.`]
        };
      }

      if (x === 'segment') {
        const h = rows.find((r) => r.segment === 'בריאות'), r0 = rows.find((r) => r.segment === 'רגיל');
        if (h && r0) {
          const totRev = h.revenue + r0.revenue, totGp = h.gross_profit + r0.gross_profit;
          const gap = h.margin_pct - r0.margin_pct;
          const headline = (p.measure === 'margin_pct' || p.measure === 'gross_profit')
            ? `מוצרי הבריאות רווחיים יותר: ${num(FMT.pct(h.margin_pct))} רווח גולמי לעומת ${num(FMT.pct(r0.margin_pct))} ברגילים`
            : `מוצרי בריאות: ${f(h[p.measure])} מול ${f(r0[p.measure])} במוצרים הרגילים`;
          return {
            headline,
            bullets: [
              `פער של ${num(FMT.pts(gap))} באחוז הרווח הגולמי ${gap >= 0 ? 'לטובת' : 'לרעת'} מוצרי הבריאות.`,
              `מוצרי הבריאות מהווים ${num(FMT.pct(h.revenue / totRev * 100))} מההכנסות אך ${num(FMT.pct(h.gross_profit / totGp * 100))} מהרווח הגולמי (${num(FMT.money(h.gross_profit))} מול ${num(FMT.money(r0.gross_profit))}).`,
              scope ? `היקף: ${esc(scope)}` : 'הניתוח כולל את כל התקופה (24 חודשים) וכל הרשתות.'
            ]
          };
        }
      }

      if (p.intent === 'total') {
        const r = rows[0];
        return {
          headline: `${esc(meas.he)}${scope ? ' ' + esc(scope) : ''}: ${f(r[p.measure])}`,
          bullets: [
            `הכנסות ${num(FMT.money(r.revenue))} · רווח גולמי ${num(FMT.money(r.gross_profit))} (${num(FMT.pct(r.margin_pct))}).`,
            `${num(FMT.num(r.units))} יחידות נמכרו · מחיר ממוצע ליחידה ${num(FMT.money(r.revenue / r.units))}.`
          ]
        };
      }

      // rank / share
      const top = rows[0], second = rows[1], last = rows[rows.length - 1];
      const s2 = R.viz.series && R.viz.series !== 'segment' ? R.viz.series : null;
      const L = (r) => [fmtKey(x, r[x]), s2 ? fmtKey(s2, r[s2]) : null].filter(Boolean).join(' · ');
      const bullets = [];
      if (!meas.ratio) {
        const tot = sum(rows, p.measure);
        if (rows.length > 1) bullets.push(`${b(L(top))} מהווה ${num(FMT.pct(top[p.measure] / tot * 100))} מסך ה${esc(meas.he)} ${p.topN || rows.length >= 10 ? 'בפריטים המוצגים' : 'בניתוח'}.`);
      }
      if (second && second[p.measure]) {
        const gap = meas.fmt === 'pct' ? FMT.pts(top[p.measure] - second[p.measure]) : FMT.pct(Math.abs(top[p.measure] / second[p.measure] - 1) * 100);
        bullets.push(`פער של ${num(gap)} ${p.order === 'ASC' ? 'מתחת למקום' : 'מעל המקום'} השני — ${b(L(second))} (${f(second[p.measure])}).`);
      }
      if (rows.length > 2) bullets.push(`${p.order === 'ASC' ? 'הגבוה ביותר ברשימה' : 'בתחתית הרשימה'}: ${b(L(last))} עם ${f(last[p.measure])}.`);
      if (p.measure !== 'margin_pct' && rows[0].margin_pct != null && rows.length > 1) {
        const bm = rows.reduce((a, r) => (r.margin_pct > a.margin_pct ? r : a), rows[0]);
        bullets.push(`הרווחיות הגבוהה ביותר: ${b(L(bm))} (${num(FMT.pct(bm.margin_pct))} רווח גולמי).`);
      }
      if (scope) bullets.push(`היקף: ${esc(scope)}`);
      return {
        headline: `${p.order === 'ASC' ? 'במקום האחרון' : 'בראש הדירוג'}: ${b(L(top))} עם ${f(top[p.measure])}${p.intent === 'share' && top.share_pct != null ? ` (${num(FMT.pct(top.share_pct))} נתח)` : ''}`,
        bullets: bullets.slice(0, 4)
      };
    }
    function fmtKey(col, v) {
      if (col === 'sale_month' && /^\d{4}-\d{2}$/.test(v)) return mLabel(v);
      if (col === 'sale_quarter' && /^\d{4}-Q\d$/.test(v)) return qLabel(v);
      return v;
    }
    const n3 = (tcol) => (tcol === 'sale_month' ? '3 החודשים' : 'הרבעונים');

    function invInsight(p, R, rows) {
      const x = R.viz.x;
      if (R.aux.inv === 'overview' && !x) {
        const s = rows.find((r) => r.stock_status === 'חוסר צפוי'), e = rows.find((r) => r.stock_status === 'עודף');
        const tot = sum(rows, 'stock_value');
        return {
          headline: `שווי מלאי כולל ${num(FMT.money(tot))} — ${num(s ? s.items : 0)} פריטים בסיכון חוסר`,
          bullets: [
            e ? `${num(FMT.money(e.stock_value))} (${num(FMT.pct(e.stock_value / tot * 100))}) כלואים במלאי עודף (מעל 60 ימי מלאי).` : '',
            `תמונת המלאי נכונה ל-30/09/2026; ימי מלאי מחושבים לפי ממוצע מכירות יומי ב-3 החודשים האחרונים.`
          ].filter(Boolean)
        };
      }
      if (x === 'stock_status' || x) {
        const top = rows[0], key = R.aux.sortBy;
        const label = colLabel(key);
        return {
          headline: `${b(top[x])} בראש הרשימה: ${num(fmtBy(colKind(key), top[key]))} ${esc(label)}`,
          bullets: [
            `סה״כ ${num(sum(rows, 'shortage_items'))} פריטים בסיכון חוסר ו-${num(sum(rows, 'excess_items'))} בעודף מלאי.`,
            `שווי המלאי הכולל בניתוח: ${num(FMT.money(sum(rows, 'stock_value')))}.`
          ]
        };
      }
      const worst = rows[0];
      const byChain = {};
      rows.forEach((r) => { byChain[r.chain] = (byChain[r.chain] || 0) + 1; });
      const topChain = Object.entries(byChain).sort((a, z) => z[1] - a[1])[0];
      if (R.aux.inv === 'shortage') {
        return {
          headline: `${num(rows.length)} פריטים בסיכון חוסר מלאי בשבוע הקרוב`,
          bullets: [
            `הקריטי ביותר: ${b(worst.product)} בסניף ${b(worst.branch)} (${esc(worst.chain)}) — ${num(worst.days_of_cover)} ימי מלאי בלבד.`,
            `הרשת עם מספר החוסרים הגבוה ביותר: ${b(topChain[0])} (${num(topChain[1])} פריטים).`,
            `מומלץ להקדים הזמנות רכש לפריטים עם פחות מ-3 ימי מלאי.`
          ]
        };
      }
      return {
        headline: `${num(FMT.money(sum(rows, 'stock_value')))} כלואים ב-${num(rows.length)} פריטים בעודף מלאי`,
        bullets: [
          `העודף היקר ביותר: ${b(worst.product)} בסניף ${b(worst.branch)} — ${num(FMT.money(worst.stock_value))} (${num(worst.days_of_cover)} ימי מלאי).`,
          `הרשת עם הכי הרבה פריטים בעודף: ${b(topChain[0])} (${num(topChain[1])}).`,
          `שקלו מבצעי הוזלה או העברה בין סניפים לשחרור הון חוזר.`
        ]
      };
    }

    // ------------------------------------------------------ follow-ups
    function followups(p, R, rows) {
      const out = [];
      const meas = MEASURES[p.measure];
      const tPhrase = p.time ? ' ' + p.time.phrase : '';
      const fPhrase = (skip) => Object.entries(p.filters).filter(([d]) => ![].concat(skip || []).includes(d) && !(skip === 'category' && d === 'product')).map(([d, v]) =>
        d === 'segment' ? (v[0] === 'בריאות' ? ' בקרב מוצרי בריאות' : '') : v.length > 1 ? '' : ` ב${DIMS[d].sing} ${v[0]}`).join('');
      const x = R.viz && R.viz.x;
      const top = rows && rows[0] && x ? rows[0][x] : null;
      const d0 = p.dims[0] && !['segment', 'month', 'quarter'].includes(p.dims[0]) ? p.dims[0] : null;

      if (p.intent === 'inventory') {
        if (p.inv !== 'shortage') out.push('אילו מוצרים בסיכון חוסר במלאי?');
        out.push('אילו קטגוריות עם הכי הרבה חוסרים במלאי?');
        if (p.inv !== 'excess') out.push('אילו מוצרים במלאי עודף?');
        out.push('מה שווי המלאי לפי רשת?');
        out.push('השווה את ימי המלאי לפי קטגוריה');
      } else if (p.intent === 'trend') {
        const s = R.viz.series;
        if (!s) out.push(`השווה את מגמת ${meas.def} לפי ${p.filters.chain ? 'קטגוריה' : 'רשת'}${fPhrase()}`);
        out.push(`איזו קטגוריה הציגה את הצמיחה הגבוהה ביותר ברבעון האחרון${fPhrase('category')}?`);
        if (p.measure !== 'margin_pct') out.push(`מה מגמת אחוז הרווח הגולמי לפי רבעון${fPhrase()}?`);
        else out.push(`מה מגמת ההכנסות החודשית${fPhrase()}?`);
        if (s && rows && rows.length) {
          const lastP = rows[rows.length - 1][R.viz.x];
          const best = rows.filter((r) => r[R.viz.x] === lastP).sort((a, z) => z[p.measure] - a[p.measure])[0];
          const dd = Object.keys(DIMS).find((k) => DIMS[k].col === s);
          if (best && DIMS[dd] && DIMS[dd].child) out.push(`אילו ${DIMS[DIMS[dd].child].pl} ${DIMS[DIMS[dd].child].adj} ב${DIMS[dd].sing} ${best[s]}?`);
        }
      } else if (x === 'segment' || R.viz.series === 'segment') {
        out.push('השווה את אחוז הרווח הגולמי של מוצרי בריאות לעומת רגילים לפי רשת');
        out.push('מה מגמת ההכנסות החודשית של מוצרי בריאות לעומת רגילים?');
        out.push('אילו מוצרי בריאות צומחים הכי מהר ברבעון האחרון?');
        out.push('מה נתח ההכנסות לפי קטגוריה בקרב מוצרי בריאות?');
      } else if (d0 && top != null) {
        const D = DIMS[d0];
        if (D.child && !(p.filters[D.child])) out.push(`אילו ${DIMS[D.child].pl} ${DIMS[D.child].adj} ב${D.sing} ${top}${tPhrase}?`);
        if (p.intent !== 'growth') out.push(`${D.which} ${D.sing} ${D.which === 'איזו' ? 'הציגה' : 'הציג'} את הצמיחה הגבוהה ביותר ברבעון האחרון${fPhrase(d0)}?`);
        else out.push(`השווה את הצמיחה לעומת אשתקד לפי ${D.sing}${fPhrase(d0)}`);
        out.push(`מה מגמת ${meas.def} החודשית של ${top}?`);
        if (p.measure !== 'margin_pct') out.push(`מה אחוז הרווח הגולמי לפי ${D.sing}${tPhrase}${fPhrase(d0)}?`);
        else out.push(`מה ההכנסות לפי ${D.sing}${tPhrase}${fPhrase(d0)}?`);
        if (p.intent !== 'share' && !meas.ratio) out.push(`מה נתח ${meas.def} לפי ${D.sing}${tPhrase}${fPhrase(d0)}?`);
      } else {
        out.push(`מה ${meas.def} לפי רשת${tPhrase}${fPhrase('chain')}?`);
        out.push(`איזו קטגוריה הציגה את הצמיחה הגבוהה ביותר ברבעון האחרון${fPhrase('category')}?`);
        out.push(`מה מגמת ${meas.def} החודשית${fPhrase()}?`);
        out.push('השווה בין הרווח הגולמי של מוצרי הבריאות למוצרים הרגילים');
      }
      const seen = new Set([normalize(p.q)]);
      return out.filter((s) => { const k = normalize(s); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
    }

    // ------------------------------------------------------ public: ask
    function run(sql) {
      const t0 = (global.performance || Date).now();
      const rows = alasql(sql);
      const ms = (global.performance || Date).now() - t0;
      return { rows: Array.isArray(rows) ? rows : [], ms };
    }

    function titleFor(p) {
      const meas = MEASURES[p.measure];
      const dims = p.dims.map((d) => DIMS[d].sing);
      const parts = [];
      if (p.intent === 'growth') parts.push(`צמיחה ב${meas.he}`);
      else if (p.intent === 'trend') parts.push(`מגמת ${meas.he}`);
      else if (p.intent === 'share') parts.push(`נתח ${meas.he}`);
      else if (p.intent === 'inventory') parts.push(p.inv === 'shortage' ? 'סיכון חוסר במלאי' : p.inv === 'excess' ? 'עודפי מלאי' : 'מצב המלאי');
      else parts.push(meas.he);
      if (dims.length) parts.push('לפי ' + dims.join(' ו'));
      return parts.join(' ');
    }

    function chips(p, R) {
      const c = [];
      const intents = { growth: 'צמיחה', trend: 'מגמה', share: 'נתח', rank: 'דירוג', total: 'סיכום', inventory: 'מלאי' };
      c.push(intents[p.intent] || '');
      if (p.intent === 'growth' && R.aux.cur) c.push(`${R.aux.cur.label} מול ${R.aux.prev.label}`);
      else if (p.time) c.push(p.time.label);
      else if (p.intent !== 'inventory') c.push('כל התקופה');
      filterPhrase(p).forEach((s) => c.push(s));
      return c.filter(Boolean);
    }

    function ask(question) {
      if (ctx.mode === 'generic') return askGeneric(question);
      let p = parse(question);
      if (ctx.last && (p.flags.cont || (!p.flags.signals && (Object.keys(p.filters).length || p.time)))) p = mergeWithLast(p);
      if (!p.intent) return helpAnswer(question);
      if (p.intent === 'growth' && !p.dims.length && p.flags.yoy === undefined) p.flags.yoy = false;
      const R = build(p);
      const { rows, ms } = run(R.sql);
      ctx.last = p;
      return {
        question: p.q, title: titleFor(p), sql: R.sql, rows, ms, viz: R.viz,
        insight: insight(p, R, rows), followups: followups(p, R, rows), chips: chips(p, R),
        parse: { intent: p.intent, measure: p.measure, dims: p.dims, filters: p.filters, time: p.time && p.time.label, merged: !!p.flags.merged }
      };
    }

    function helpAnswer(question) {
      return {
        question: normalize(question), title: 'לא הצלחתי לפענח את השאלה', sql: null, rows: [], viz: { type: 'help' }, chips: ['עזרה'],
        insight: {
          headline: 'נסו לנסח את השאלה עם מדד, חיתוך או תקופה',
          bullets: ['מדדים: הכנסות, רווח גולמי, אחוז רווח, יחידות, מחיר ממוצע, מלאי.', 'חיתוכים: לפי רשת / קטגוריה / סניף / עיר / מוצר / מותג, בריאות מול רגיל.', 'תקופות: רבעון אחרון, Q2 2026, 2025, 6 חודשים אחרונים, לעומת אשתקד.']
        },
        followups: ['מה ההכנסות לפי רשת ברבעון האחרון?', 'איזו קטגוריה הציגה את הצמיחה הגבוהה ביותר ברבעון האחרון?', 'אילו מוצרים בסיכון חוסר במלאי?']
      };
    }

    // ------------------------------------------------------ edited SQL
    function autoViz(rows) {
      if (!rows.length) return { type: 'table' };
      const cols = Object.keys(rows[0]);
      const isNum = (c) => rows.every((r) => r[c] == null || typeof r[c] === 'number');
      const nums = cols.filter(isNum).filter((c) => !/year|שנה/.test(c));
      const texts = cols.filter((c) => !isNum(c));
      const timeLike = (c) => rows.every((r) => r[c] == null || /^\d{4}-(\d{2}|Q[1-4])(-\d{2})?$/.test(String(r[c])));
      if (rows.length === 1 && !texts.length && nums.length) return { type: 'kpi', y: nums.slice(0, 4) };
      if (!nums.length) return { type: 'table' };
      const tcol = texts.find(timeLike);
      if (tcol) {
        const series = texts.find((c) => c !== tcol) || null;
        return { type: 'line', x: tcol, y: [nums[0]], series };
      }
      if (texts.length === 1 && rows.length <= 40) return { type: 'bar', x: texts[0], y: [nums.find((c) => c !== 'growth_pct') && cols.includes('growth_pct') ? 'growth_pct' : nums[0]], sign: cols.includes('growth_pct') || nums[0] === 'change_pts', highlight: true };
      if (texts.length === 2 && new Set(rows.map((r) => r[texts[1]])).size <= 8 && rows.length <= 60) return { type: 'bar', x: texts[0], y: [nums[0]], series: texts[1] };
      return { type: 'table' };
    }

    function genericInsight(rows, viz, labels) {
      if (!rows.length) return { headline: 'השאילתה החזירה 0 שורות', bullets: [] };
      const L = (c) => esc(colLabel(c, labels));
      const F = (c, v) => num(fmtBy(colKind(c), v));
      if (viz.type === 'kpi') return { headline: viz.y.map((c) => `${L(c)}: ${F(c, rows[0][c])}`).slice(0, 2).join(' · '), bullets: viz.y.slice(2).map((c) => `${L(c)}: ${F(c, rows[0][c])}`) };
      if (viz.type === 'line' && !viz.series) {
        const y = viz.y[0], a = rows[0][y], z = rows[rows.length - 1][y];
        const peak = rows.reduce((m, r) => (r[y] > m[y] ? r : m), rows[0]);
        const K = (v) => (/^\d{4}-\d{2}$/.test(v) ? mLabel(v) : /^\d{4}-Q\d$/.test(v) ? qLabel(v) : v);
        return { headline: `${L(y)}: ${num(FMT.signedPct((z / a - 1) * 100))} בין ${esc(K(rows[0][viz.x]))} ל-${esc(K(rows[rows.length - 1][viz.x]))}`, bullets: [`שיא: ${b(K(peak[viz.x]))} (${F(y, peak[y])}).`, `${num(rows.length)} נקודות זמן.`] };
      }
      if ((viz.type === 'bar' || viz.type === 'doughnut') && !viz.series) {
        const y = viz.y[0];
        const sorted = [...rows].sort((a, z) => z[y] - a[y]);
        const tot = sum(rows, y);
        return {
          headline: `בראש: ${b(sorted[0][viz.x])} עם ${F(y, sorted[0][y])}`,
          bullets: [
            colKind(y) !== 'pct' && tot ? `${num(FMT.pct(sorted[0][y] / tot * 100))} מהסך המוצג.` : '',
            sorted.length > 1 ? `בתחתית: ${b(sorted[sorted.length - 1][viz.x])} (${F(y, sorted[sorted.length - 1][y])}).` : '',
            `${num(rows.length)} שורות בתוצאה.`
          ].filter(Boolean)
        };
      }
      return { headline: `השאילתה החזירה ${num(rows.length)} שורות`, bullets: [`עמודות: ${Object.keys(rows[0]).map(L).join(', ')}`] };
    }

    function runCustom(sql, labels) {
      const { rows, ms } = run(sql);
      const viz = autoViz(rows);
      return { sql, rows, ms, viz, insight: genericInsight(rows, viz, labels) };
    }

    // ------------------------------------------------------ generic mode (uploaded files)
    function setGeneric(info) { ctx.mode = info ? 'generic' : 'builtin'; ctx.generic = info; ctx.last = null; }

    function askGeneric(question) {
      const G = ctx.generic; // {table, columns:[{name,type,values?,label}]}
      const q = normalize(question); let t = ' ' + q.toLowerCase() + ' ';
      const id = (c) => `[${c}]`;
      const filters = [];
      G.columns.filter((c) => c.type === 'text' && c.values).forEach((c) => {
        c.values.filter((v) => String(v).length >= 2).sort((a, z) => String(z).length - String(a).length).forEach((v) => {
          const term = String(v).toLowerCase();
          if (hasTerm(t, term)) { filters.push([c.name, v]); t = t.replace(termRegex(term), (a, pre) => pre + '§v§'); }
        });
      });
      const mentions = (c) => {
        const names = [c.name.toLowerCase(), ...c.name.toLowerCase().split(/[_\s]+/).filter((w) => w.length >= 3)];
        return names.some((w) => t.includes(w));
      };
      const nums = G.columns.filter((c) => c.type === 'number');
      const texts = G.columns.filter((c) => c.type === 'text');
      const dateC = G.columns.find((c) => c.type === 'date');
      let measure = nums.find(mentions) || nums.find((c) => /revenue|sales|amount|total|price|sum|מכיר|הכנס|סכום|מחזור|פדיון|רווח|profit/i.test(c.name)) || nums[0];
      let agg = 'SUM';
      if (anyIncl(t, ['ממוצע', 'average', 'avg', 'mean'])) agg = 'AVG';
      else if (anyIncl(t, ['מקסימום', 'max', 'maximum', 'השיא'])) agg = 'MAX';
      else if (anyIncl(t, ['מינימום', 'min ', 'minimum'])) agg = 'MIN';
      if (!measure || (anyIncl(t, ['כמה רשומות', 'מספר רשומות', 'מספר השורות', 'count', 'how many rows', 'מספר ה']) && !nums.some(mentions))) { agg = 'COUNT'; }
      const usedFilterCols = new Set(filters.map((f) => f[0]));
      let dim = texts.find((c) => mentions(c) && !usedFilterCols.has(c.name));
      const isTrend = anyIncl(t, KW.trend) && dateC;
      if (!dim && !isTrend && !anyIncl(t, ['סה״כ', 'סה"כ', 'total', 'overall', 'סך הכל'])) {
        dim = texts.filter((c) => !usedFilterCols.has(c.name) && c.card >= 2 && c.card <= 50).sort((a, z) => a.card - z.card)[0];
      }
      const order = anyIncl(t, KW.lowest) ? 'ASC' : 'DESC';
      let mm, topN = null; if ((mm = /(?:top|טופ)\s*(\d{1,2})/i.exec(t)) || (mm = /(\d{1,2})\s*(?:ה)?[א-תa-z]+ים\s*(?:ה)?(?:מוביל|גבוה|top)/.exec(t))) topN = +mm[1];
      const mExprG = agg === 'COUNT' ? 'COUNT(*)' : `ROUND(${agg}(${id(measure.name)}), 2)`;
      const mAlias = agg === 'COUNT' ? 'count_rows' : `${agg.toLowerCase()}_${measure.name.replace(/[^\w֐-׿]+/g, '_')}`;
      const where = filters.length ? '\nWHERE ' + filters.map(([c, v]) => `${id(c)} = ${typeof v === 'number' ? v : sq(v)}`).join('\n  AND ') : '';
      let sql, viz;
      if (isTrend) {
        const mc = dateC.name + '__month';
        sql = `SELECT\n  ${id(mc)} AS period,\n  ${mExprG} AS ${id(mAlias)}\nFROM ${G.table}${where}\nGROUP BY ${id(mc)}\nORDER BY period`;
        viz = { type: 'line', x: 'period', y: [mAlias] };
      } else if (dim) {
        sql = `SELECT\n  ${id(dim.name)},\n  ${mExprG} AS ${id(mAlias)}\nFROM ${G.table}${where}\nGROUP BY ${id(dim.name)}\nORDER BY ${id(mAlias)} ${order}${topN ? `\nLIMIT ${topN}` : dim.card > 25 ? '\nLIMIT 15' : ''}`;
        viz = anyIncl(t, KW.share) ? { type: 'doughnut', x: dim.name, y: [mAlias] } : { type: 'bar', x: dim.name, y: [mAlias], highlight: true };
      } else {
        sql = `SELECT\n  ${mExprG} AS ${id(mAlias)},\n  COUNT(*) AS rows_count\nFROM ${G.table}${where}`;
        viz = { type: 'kpi', y: [mAlias, 'rows_count'] };
      }
      const { rows, ms } = run(sql);
      const labels = { period: 'תקופה', rows_count: 'מספר רשומות', count_rows: 'מספר רשומות' };
      if (agg !== 'COUNT') labels[mAlias] = `${{ SUM: 'סה״כ', AVG: 'ממוצע', MAX: 'מקסימום', MIN: 'מינימום' }[agg]} ${measure.name}`;
      const fu = [];
      const otherText = texts.find((c) => c !== dim && !usedFilterCols.has(c.name) && c.card >= 2 && c.card <= 50);
      if (otherText) fu.push(`מה ה${measure ? measure.name : 'כמות'} לפי ${otherText.name}?`);
      if (dateC && !isTrend) fu.push(`מה המגמה החודשית של ${measure ? measure.name : 'הרשומות'}?`);
      if (measure && agg !== 'AVG' && dim) fu.push(`מה ה${measure.name} הממוצע לפי ${dim.name}?`);
      if (dim && rows[0]) fu.push(`מה ה${measure ? measure.name : 'כמות'} לפי ${(otherText || dim).name} ב${rows[0][dim.name]}?`);
      return {
        question: q, title: q, sql, rows, ms, viz, labels,
        insight: genericInsight(rows, viz, labels),
        followups: fu.slice(0, 3), chips: ['קובץ: ' + G.fileName, filters.map((f) => f[1]).join(' · ')].filter(Boolean)
      };
    }

    return { loadMeta, ask, parse, runCustom, autoViz, setGeneric, ctx, FMT, colLabel, colKind, fmtBy };
  }

  global.TQEngine = { create: createEngine, FMT, colLabel, colKind, fmtBy, normalize, esc };
})(typeof window !== 'undefined' ? window : globalThis);
