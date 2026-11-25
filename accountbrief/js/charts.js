/* =====================================================================
   AccountBrief AI — Visualization layer (Chart.js 4 + HTML KPI/table)
   ===================================================================== */
(function (global) {
  'use strict';
  const E = global.TQEngine;
  const PALETTE = ['#3730A3', '#C2410C', '#15803D', '#B45309', '#0E7490', '#9D174D', '#57534E', '#6D28D9'];
  const INDIGO = '#3730A3', TERRA = '#C2410C', SAGE = '#15803D';
  const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const HE_M = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
  const prettyKey = (v) => {
    const s = String(v);
    let m;
    if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return `${HE_M[+m[2] - 1]} ${m[1].slice(2)}`;
    if ((m = /^(\d{4})-Q(\d)$/.exec(s))) return `Q${m[2]} ${m[1].slice(2)}`;
    return s;
  };

  if (global.Chart) {
    Chart.defaults.font.family = "'Heebo', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#78716C';
    Chart.defaults.borderColor = '#EFECE6';
    Chart.defaults.plugins.tooltip.backgroundColor = '#1C1917';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
    Chart.defaults.plugins.tooltip.rtl = true;
    Chart.defaults.plugins.tooltip.textDirection = 'rtl';
    Chart.defaults.plugins.legend.rtl = true;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
  }

  // value labels at bar ends
  const valueLabels = {
    id: 'tqValueLabels',
    afterDatasetsDraw(chart, args, opts) {
      if (!opts || !opts.enabled) return;
      const { ctx } = chart;
      ctx.save();
      ctx.direction = 'ltr';
      ctx.font = "600 11px 'Heebo', sans-serif";
      ctx.fillStyle = '#44403C';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((el, i) => {
          const v = ds.data[i];
          if (v == null) return;
          const txt = opts.fmt(v);
          const horiz = chart.options.indexAxis === 'y';
          if (horiz) {
            const rev = chart.options.scales.x.reverse;
            const neg = v < 0;
            ctx.textAlign = (rev !== neg) ? 'right' : 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(txt, el.x + ((rev !== neg) ? -6 : 6), el.y);
          } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = v < 0 ? 'top' : 'bottom';
            ctx.fillText(txt, el.x, el.y + (v < 0 ? 4 : -4));
          }
        });
      });
      ctx.restore();
    }
  };
  if (global.Chart) Chart.register(valueLabels);

  function available(spec, rows) {
    if (spec.type === 'help') return [];
    if (!rows || !rows.length) return ['table'];
    if (spec.type === 'kpi') return ['kpi', 'table'];
    if (!spec.x) return ['table'];
    const types = ['bar', 'line'];
    if (!spec.series && !spec.sign && rows.length <= 12 && rows.every((r) => (r[spec.y[0]] || 0) >= 0) && E.colKind(spec.y[0]) !== 'pct') types.push('doughnut');
    types.push('table');
    return types;
  }

  function render(container, spec, rows, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (container._chart) { container._chart.destroy(); container._chart = null; }
    const type = opts.type || spec.type;
    if (!rows.length && type !== 'help') { container.innerHTML = '<div class="viz-empty">אין נתונים להצגה</div>'; return; }
    if (type === 'kpi') return renderKPI(container, spec, rows, opts);
    if (type === 'table' || type === 'help') return renderTable(container, rows, opts);
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap' + (opts.compact ? ' compact' : '');
    const cv = document.createElement('canvas');
    wrap.appendChild(cv);
    container.appendChild(wrap);
    const cfg = type === 'line' ? lineCfg(spec, rows) : type === 'doughnut' ? doughnutCfg(spec, rows) : barCfg(spec, rows);
    if (opts.static) { cfg.options.animation = false; }
    cfg.options.responsive = true;
    cfg.options.maintainAspectRatio = false;
    container._chart = new Chart(cv, cfg);
    return container._chart;
  }

  // ---------- pivot helper for series
  function pivot(rows, x, s, y) {
    const xs = [], ss = [], map = {};
    rows.forEach((r) => {
      if (!xs.includes(r[x])) xs.push(r[x]);
      if (!ss.includes(r[s])) ss.push(r[s]);
      map[r[x] + '\u0000' + r[s]] = r[y];
    });
    return { xs, ss, get: (xv, sv) => (map[xv + '\u0000' + sv] ?? null) };
  }

  function barCfg(spec, rows) {
    const y = spec.y[0], kind = E.colKind(y);
    const fmt = (v) => '\u2066' + E.fmtBy(kind, v) + '\u2069';
    let labels, datasets;
    if (spec.series) {
      const pv = pivot(rows, spec.x, spec.series, y);
      labels = pv.xs.map(prettyKey);
      const segColors = { 'בריאות': SAGE, 'רגיל': INDIGO };
      datasets = pv.ss.map((s, i) => ({
        label: String(s), data: pv.xs.map((xv) => pv.get(xv, s)),
        backgroundColor: segColors[s] || PALETTE[i % PALETTE.length], borderRadius: 5, maxBarThickness: 34
      }));
    } else {
      labels = rows.map((r) => prettyKey(r[spec.x]));
      const data = rows.map((r) => r[y]);
      let colors;
      if (spec.sign) colors = data.map((v) => (v >= 0 ? SAGE : TERRA));
      else if (spec.x === 'segment') colors = rows.map((r) => (r.segment === 'בריאות' ? SAGE : INDIGO));
      else {
        const maxV = Math.max(...data);
        colors = data.map((v) => (v === maxV ? INDIGO : alpha(INDIGO, 0.32)));
      }
      datasets = [{ label: E.colLabel(y), data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 46, borderSkipped: false }];
    }
    const longLabels = labels.some((l) => String(l).length > 14);
    const horizontal = spec.horizontal || labels.length > 8 || longLabels;
    const many = labels.length * datasets.length;
    return {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        layout: { padding: { top: 18, left: 8, right: 8 } },
        plugins: {
          legend: { display: datasets.length > 1, position: 'top', align: 'start' },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}` } },
          tqValueLabels: { enabled: many <= 16, fmt: (v) => (spec.sign ? E.FMT.signedPct(v) : fmt(v)) }
        },
        scales: horizontal ? {
          x: { reverse: true, grid: { color: '#F2EFEA' }, border: { display: false }, ticks: { callback: (v) => fmt(v), maxTicksLimit: 6 }, grace: '12%' },
          y: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { color: '#44403C', font: { size: 12 } } }
        } : {
          x: { reverse: true, grid: { display: false }, border: { display: false }, ticks: { color: '#44403C' } },
          y: { position: 'right', grid: { color: '#F2EFEA' }, border: { display: false }, ticks: { callback: (v) => fmt(v), maxTicksLimit: 6 }, grace: '10%' }
        }
      }
    };
  }

  function lineCfg(spec, rows) {
    const y = spec.y[0], kind = E.colKind(y);
    const fmt = (v) => '\u2066' + E.fmtBy(kind, v) + '\u2069';
    let labels, datasets;
    const mk = (label, data, color, i) => ({
      label, data, borderColor: color, backgroundColor: alpha(color, 0.08), fill: i === 0 && data.length > 0 && !spec.series,
      tension: 0.35, borderWidth: 2.2, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: color
    });
    if (spec.series) {
      const pv = pivot(rows, spec.x, spec.series, y);
      labels = pv.xs.map(prettyKey);
      const segColors = { 'בריאות': SAGE, 'רגיל': INDIGO };
      datasets = pv.ss.map((s, i) => mk(String(s), pv.xs.map((xv) => pv.get(xv, s)), segColors[s] || PALETTE[i % PALETTE.length], i));
    } else {
      labels = rows.map((r) => prettyKey(r[spec.x]));
      datasets = [mk(E.colLabel(y), rows.map((r) => r[y]), INDIGO, 0)];
    }
    return {
      type: 'line',
      data: { labels, datasets },
      options: {
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8 } },
        plugins: {
          legend: { display: datasets.length > 1, position: 'top', align: 'start' },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}` } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
          y: { position: 'right', grid: { color: '#F2EFEA' }, border: { display: false }, ticks: { callback: (v) => fmt(v), maxTicksLimit: 6 } }
        }
      }
    };
  }

  function doughnutCfg(spec, rows) {
    const y = spec.y[0], kind = E.colKind(y);
    const fmt = (v) => '\u2066' + E.fmtBy(kind, v) + '\u2069';
    const total = rows.reduce((a, r) => a + (+r[y] || 0), 0);
    const statusColors = { 'חוסר צפוי': TERRA, 'תקין': SAGE, 'עודף': '#B45309' };
    const center = {
      id: 'tqCenter',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data[0]) return;
        const { x, y: cy } = meta.data[0];
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1C1917';
        ctx.font = "600 22px 'Frank Ruhl Libre', serif";
        ctx.direction = 'ltr';
        ctx.fillText(E.fmtBy(kind, total), x, cy + 4);
        ctx.direction = 'rtl';
        ctx.fillStyle = '#A8A29E';
        ctx.font = "12px 'Heebo', sans-serif";
        ctx.fillText('סה״כ', x, cy + 22);
        ctx.restore();
      }
    };
    return {
      type: 'doughnut',
      data: {
        labels: rows.map((r) => String(r[spec.x])),
        datasets: [{ data: rows.map((r) => r[y]), backgroundColor: rows.map((r, i) => statusColors[r[spec.x]] || PALETTE[i % PALETTE.length]), borderColor: '#fff', borderWidth: 3, hoverOffset: 6 }]
      },
      options: {
        cutout: '64%',
        layout: { padding: 8 },
        plugins: {
          legend: { position: 'left', labels: { padding: 14, generateLabels: (ch) => ch.data.labels.map((l, i) => ({ text: `${l}  ·  ${(ch.data.datasets[0].data[i] / total * 100).toFixed(1)}%`, fillStyle: ch.data.datasets[0].backgroundColor[i], strokeStyle: '#fff', pointStyle: 'circle', index: i, hidden: !ch.getDataVisibility(i) })) } },
          tooltip: { callbacks: { label: (c) => ` ${fmt(c.raw)} (${(c.raw / total * 100).toFixed(1)}%)` } }
        }
      },
      plugins: [center]
    };
  }

  function renderKPI(container, spec, rows, opts) {
    const r = rows[0];
    const cols = (spec.y && spec.y.length ? spec.y : Object.keys(r)).filter((c) => c in r).slice(0, 4);
    const el = document.createElement('div');
    el.className = 'kpi-grid' + (opts.compact ? ' compact' : '');
    el.innerHTML = cols.map((c, i) => {
      const kind = E.colKind(c);
      const v = r[c];
      const isG = c === 'growth_pct' || c === 'change_pts';
      const cls = isG ? (v >= 0 ? 'pos' : 'neg') : '';
      const txt = isG ? (c === 'growth_pct' ? E.FMT.signedPct(v) : E.FMT.pts(v)) : E.fmtBy(kind, v);
      return `<div class="kpi ${i === 0 ? 'primary' : ''}"><div class="kpi-label">${E.esc(E.colLabel(c, opts.labels))}</div><div class="kpi-value ${cls}"><bdi>${txt}</bdi></div><div class="kpi-full"><bdi>${E.esc(E.FMT.full(v, kind))}</bdi></div></div>`;
    }).join('');
    container.appendChild(el);
  }

  function renderTable(container, rows, opts) {
    if (!rows.length) { container.innerHTML = '<div class="viz-empty">אין שורות</div>'; return; }
    const cols = Object.keys(rows[0]);
    const max = opts.maxRows || 500;
    const kinds = cols.map((c) => (rows.some((r) => typeof r[c] === 'number') ? E.colKind(c) : 'text'));
    const el = document.createElement('div');
    el.className = 'table-wrap' + (opts.compact ? ' compact' : '');
    el.innerHTML = `<table class="data-table"><thead><tr>${cols.map((c, i) => `<th class="${kinds[i] !== 'text' ? 'n' : ''}">${E.esc(E.colLabel(c, opts.labels))}</th>`).join('')}</tr></thead><tbody>${
      rows.slice(0, max).map((r) => `<tr>${cols.map((c, i) => {
        const v = r[c];
        if (kinds[i] === 'text') return `<td>${E.esc(prettyKey(v ?? '—'))}</td>`;
        const cls = (c === 'growth_pct' || c === 'change_pts') ? (v >= 0 ? 'n pos' : 'n neg') : c === 'days_of_cover' && v < 7 ? 'n neg' : 'n';
        return `<td class="${cls}"><bdi>${E.esc(c === 'growth_pct' ? E.FMT.signedPct(v) : E.FMT.full(v, kinds[i]))}</bdi></td>`;
      }).join('')}</tr>`).join('')
    }</tbody></table>${rows.length > max ? `<div class="table-more">מוצגות ${max} מתוך ${rows.length} שורות</div>` : ''}`;
    container.appendChild(el);
  }

  // 12-month purchase trend for one account, this year vs. the same months a year earlier
  function renderBriefTrend(container, rows, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (container._chart) { container._chart.destroy(); container._chart = null; }
    const cur = rows.slice(-12), prev = rows.slice(-24, -12);
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap brief-chart';
    const cv = document.createElement('canvas');
    wrap.appendChild(cv); container.appendChild(wrap);
    const fmt = (v) => '\u2066' + E.FMT.money(v) + '\u2069';
    container._chart = new Chart(cv, {
      type: 'line',
      data: {
        labels: cur.map((r) => prettyKey(r.sale_month)),
        datasets: [
          { label: '12 החודשים האחרונים', data: cur.map((r) => r.revenue), borderColor: INDIGO, backgroundColor: alpha(INDIGO, 0.08), fill: true, tension: 0.35, borderWidth: 2.4, pointRadius: 3, pointBackgroundColor: INDIGO },
          { label: 'אשתקד', data: prev.length === 12 ? prev.map((r) => r.revenue) : [], borderColor: '#A8A29E', borderDash: [5, 4], fill: false, tension: 0.35, borderWidth: 1.6, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: opts.static ? false : undefined,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'start' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 10 } },
          y: { position: 'right', grid: { color: '#F2EFEA' }, border: { display: false }, ticks: { callback: (v) => fmt(v), maxTicksLimit: 5 } }
        }
      }
    });
  }

  global.TQCharts = { render, renderBriefTrend, available, prettyKey, PALETTE };
})(window);
