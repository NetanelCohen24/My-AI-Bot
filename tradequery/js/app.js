/* =====================================================================
   TradeQuery AI — Application shell (chat stream ⇄ live canvas ⇄ board)
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = TQEngine.esc;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const ICON = {
    bar: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
    line: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 17l5-5 4 3 8-9"/></svg>',
    doughnut: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 5"/></svg>',
    table: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9"/></svg>',
    kpi: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="5" width="8" height="14" rx="2"/><rect x="13" y="5" width="8" height="6" rx="2"/><rect x="13" y="13" width="8" height="6" rx="2"/></svg>',
    pin: '<svg class="ic" viewBox="0 0 24 24"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6"/></svg>',
    chev: '<svg class="ic chev" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    arrow: '<svg class="ic" viewBox="0 0 24 24"><path d="M19 12H5m0 0 5-5m-5 5 5 5"/></svg>',
    spark: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
    x: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    open: '<svg class="ic" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>',
    edit: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
    play: '<svg class="ic" viewBox="0 0 24 24"><path d="M7 5v14l11-7z"/></svg>',
    copy: '<svg class="ic" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    dl: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 4v12m0 0-4-4m4 4 4-4M4 18v2h16v-2"/></svg>',
    db: '<svg class="ic" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>'
  };
  const VIZ_NAME = { bar: 'גרף עמודות', line: 'גרף קו', doughnut: 'גרף טבעת', table: 'טבלה', kpi: 'כרטיסי מדדים', help: 'עזרה' };

  const STARTERS = [
    ['צמיחה', 'איזו קטגוריה הציגה את הצמיחה הגבוהה ביותר ברבעון האחרון ברשת סופר גל?'],
    ['רווחיות', 'השווה בין הרווח הגולמי של מוצרי הבריאות למוצרים הרגילים'],
    ['מגמה', 'מה מגמת ההכנסות החודשית לפי רשת?'],
    ['מלאי', 'אילו מוצרים בסיכון חוסר במלאי?'],
    ['EN', 'Top 5 products by revenue in 2025']
  ];

  const S = { answers: [], current: -1, board: [], history: [], hIdx: -1, busy: false, view: 'canvas', mode: 'builtin', fileName: null };
  let E;

  // ------------------------------------------------------------ storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  // ------------------------------------------------------------ boot
  function boot() {
    if (!window.alasql || !window.Chart) {
      $('#stage').innerHTML = '<div class="artifact"><h2 class="insight-headline">לא ניתן לטעון את ספריות העיבוד</h2><p>בדקו את החיבור לרשת ורעננו את הדף.</p></div>';
      return;
    }
    if (window.TQ_EMBED) document.documentElement.classList.add('embed');
    loadBuiltin();
    S.board = store.get('tq.board.v1', []);
    $('#boardTitle').textContent = store.get('tq.boardTitle', 'לוח סיכום אנליטי');
    updateBoardCount(false);
    renderStarters();
    bindUI();
    // opening artifact: a live overview of the dataset
    const a = E.ask('מה מגמת ההכנסות החודשית של מוצרי בריאות לעומת רגילים?');
    a.chips = ['סקירת פתיחה', ...a.chips.slice(1)];
    a.opening = true;
    E.ctx.last = null;
    S.answers.push(a); S.current = 0;
    renderArtifact(a, true);
    updateHistoryNav();
    $('#question').focus();
  }

  function loadBuiltin() {
    const t0 = performance.now();
    const { sales, inventory } = TQData.build();
    ['sales', 'inventory'].forEach((t) => { if (alasql.tables[t]) alasql(`DROP TABLE ${t}`); alasql(`CREATE TABLE ${t}`); });
    alasql.tables.sales.data = sales;
    alasql.tables.inventory.data = inventory;
    E = E || TQEngine.create(alasql);
    E.setGeneric(null);
    const meta = E.loadMeta();
    S.mode = 'builtin'; S.fileName = null;
    setSource(`FMCG מובנה · ${meta.rows.toLocaleString('en-US')} שורות מכירה · ${inventory.length.toLocaleString('en-US')} שורות מלאי`, false);
    console.info(`[TradeQuery] in-memory DB ready in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  function setSource(label, custom) {
    $('#sourceLabel').textContent = label;
    $('#sourcePill').classList.toggle('custom', !!custom);
  }

  function renderStarters(list) {
    $('#starterChips').innerHTML = (list || STARTERS).map(([tag, q]) =>
      `<button type="button" class="suggestion" data-q="${esc(q)}"><span class="tag">${esc(tag)}</span><span>${esc(q)}</span></button>`).join('');
  }

  // ------------------------------------------------------------ UI bindings
  function bindUI() {
    const ta = $('#question');
    $('#composer').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
      if (e.key === 'ArrowUp' && !ta.value && S.history.length) { e.preventDefault(); S.hIdx = S.history.length - 1; ta.value = S.history[S.hIdx]; autoGrow(); }
    });
    ta.addEventListener('input', autoGrow);

    document.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-q]');
      if (chip && !S.busy) { ask(chip.dataset.q); return; }
      const card = e.target.closest('.ai-card[data-idx]');
      if (card) { showAnswer(+card.dataset.idx); }
    });

    $('#clearChat').addEventListener('click', () => {
      $$('.msg', $('#stream')).forEach((m) => m.remove());
      $('#welcome').hidden = false;
      E.ctx.last = null;
      toast('שיחה חדשה התחילה');
    });

    $('#tabCanvas').addEventListener('click', () => setView('canvas'));
    $('#tabBoard').addEventListener('click', () => setView('board'));
    $('#histPrev').addEventListener('click', () => showAnswer(S.current - 1));
    $('#histNext').addEventListener('click', () => showAnswer(S.current + 1));

    $('#exportBoard').addEventListener('click', exportBoard);
    $('#clearBoard').addEventListener('click', () => {
      const btn = $('#clearBoard');
      if (!S.board.length) return;
      if (!btn.dataset.armed) { // two-step confirm inside the page
        btn.dataset.armed = '1';
        btn.lastChild.textContent = ' לחצו שוב לאישור';
        setTimeout(() => { delete btn.dataset.armed; btn.lastChild.textContent = ' נקה לוח'; }, 3000);
        return;
      }
      delete btn.dataset.armed; btn.lastChild.textContent = ' נקה לוח';
      S.board = []; saveBoard(); renderBoard(); syncPinButtons();
    });
    $('#boardTitle').addEventListener('input', () => store.set('tq.boardTitle', $('#boardTitle').textContent.trim()));

    // schema drawer
    $('#sourcePill').addEventListener('click', openSchema);
    $('#closeDrawer').addEventListener('click', closeSchema);
    $('#schemaDrawer').addEventListener('click', (e) => { if (e.target.id === 'schemaDrawer') closeSchema(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSchema(); });

    // upload + drag & drop
    $('#fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; });
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

    window.addEventListener('afterprint', () => { $$('.print-img').forEach((img) => img.remove()); $$('.chart-wrap canvas').forEach((c) => { c.style.display = ''; }); });
  }

  function autoGrow() { const ta = $('#question'); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }

  function setView(v) {
    S.view = v;
    $('#tabCanvas').classList.toggle('active', v === 'canvas');
    $('#tabBoard').classList.toggle('active', v === 'board');
    $('#canvasView').hidden = v !== 'canvas';
    $('#boardView').hidden = v !== 'board';
    if (v === 'board') renderBoard();
    else if (S.answers[S.current]) renderArtifact(S.answers[S.current], false);
  }

  // ------------------------------------------------------------ ask flow
  function submit() {
    const ta = $('#question');
    const q = ta.value.trim();
    if (!q || S.busy) return;
    ta.value = ''; autoGrow();
    ask(q);
  }

  async function ask(q) {
    S.busy = true;
    $('#sendBtn').disabled = true;
    S.history.push(q); S.hIdx = -1;
    $('#welcome').hidden = true;
    if (S.view !== 'canvas') setView('canvas');
    $$('.followups', $('#stream')).forEach((f) => f.remove());

    const stream = $('#stream');
    stream.insertAdjacentHTML('beforeend', `<div class="msg msg-user"><div class="bubble" dir="auto">${esc(q)}</div></div>`);
    const think = document.createElement('div');
    think.className = 'msg msg-ai';
    think.innerHTML = `<div class="avatar">TQ</div><div class="ai-body"><div class="thinking"><span class="dots"><i></i><i></i><i></i></span><span class="t">מפענח את השאלה…</span></div></div>`;
    stream.appendChild(think);
    scrollStream();

    const steps = ['מפענח כוונה, מדדים וחיתוכים', 'בונה שאילתת SQL', `מריץ על ${S.mode === 'builtin' ? E.ctx.meta.rows.toLocaleString('en-US') : 'הקובץ שהועלה'} שורות בזיכרון`, 'מנסח תובנה ובוחר ויזואליזציה'];
    showSkeleton(steps);
    let ans, err;
    for (let i = 0; i < steps.length; i++) {
      markStep(i); $('.thinking .t', think).textContent = steps[i] + '…';
      if (i === 2) { try { ans = E.ask(q); } catch (e) { err = e; console.error(e); } }
      await sleep(i === 2 ? 220 : 150);
    }

    if (err || !ans) {
      think.querySelector('.ai-body').innerHTML = `<div class="ai-card"><div class="ai-headline ai-error">משהו השתבש בעיבוד השאלה.</div><div class="ai-meta">${esc(err ? err.message : '')}</div></div>`;
      if (S.answers[S.current]) renderArtifact(S.answers[S.current], false);
      done(); return;
    }

    S.answers.push(ans);
    const idx = S.answers.length - 1;
    S.current = idx;
    think.querySelector('.ai-body').innerHTML = aiCardHTML(ans, idx) + followupsHTML(ans);
    markActiveCard();
    renderArtifact(ans, true);
    updateHistoryNav();
    scrollStream();
    if (window.matchMedia('(max-width: 860px)').matches) setTimeout(() => $('.canvas-area').scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    done();

    function done() { S.busy = false; $('#sendBtn').disabled = false; $('#question').focus(); }
  }

  function aiCardHTML(a, idx) {
    const vt = a.vizType || a.viz.type;
    const meta = a.sql
      ? `<span>${esc(VIZ_NAME[vt] || vt)}</span><span class="sep"></span><span>${a.rows.length.toLocaleString('en-US')} שורות</span><span class="sep"></span><bdi>${a.ms != null ? a.ms.toFixed(0) + 'ms' : ''}</bdi>${a.parse && a.parse.merged ? '<span class="sep"></span><span>המשך לשאלה הקודמת</span>' : ''}`
      : '<span>לא זוהה מדד או חיתוך</span>';
    return `<div class="ai-card" data-idx="${idx}"><div class="ai-headline">${a.insight.headline}</div><div class="ai-meta">${meta}<span class="open-link">בקנבס ${ICON.arrow}</span></div></div>`;
  }

  function followupsHTML(a) {
    if (!a.followups || !a.followups.length) return '';
    return `<div class="followups"><div class="followups-label">${ICON.spark} שאלות המשך להעמקה</div>${a.followups.map((f) => `<button type="button" class="chip-q" data-q="${esc(f)}">${ICON.arrow}<span>${esc(f)}</span></button>`).join('')}</div>`;
  }

  function scrollStream() { const s = $('#stream'); requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; }); }
  function markActiveCard() { $$('.ai-card').forEach((c) => c.classList.toggle('active', +c.dataset.idx === S.current)); }

  function showAnswer(i) {
    if (i < 0 || i >= S.answers.length) return;
    S.current = i;
    if (S.view !== 'canvas') setView('canvas'); else renderArtifact(S.answers[i], true);
    markActiveCard();
    updateHistoryNav();
  }

  function updateHistoryNav() {
    const n = S.answers.length;
    $('#historyNav').hidden = n < 2;
    $('#histPos').textContent = `${S.current + 1} / ${n}`;
    $('#histPrev').disabled = S.current <= 0;
    $('#histNext').disabled = S.current >= n - 1;
  }

  // ------------------------------------------------------------ skeleton
  function showSkeleton(steps) {
    const stage = $('#stage');
    stage.innerHTML = `<div class="skeleton artifact enter">
      <div class="sk" style="width:160px;height:20px"></div>
      <div class="sk" style="width:72%;height:30px;margin-top:22px"></div>
      <div class="sk" style="width:54%;height:14px;margin-top:14px"></div>
      <div class="sk" style="width:100%;height:220px;margin-top:22px;border-radius:14px"></div>
      <ul class="steps">${steps.map((s) => `<li><span class="s"></span>${esc(s)}</li>`).join('')}</ul></div>`;
  }
  function markStep(i) { $$('.steps li').forEach((li, j) => { li.className = j < i ? 'done' : j === i ? 'now' : ''; }); }

  // ------------------------------------------------------------ artifact
  function renderArtifact(a, animate) {
    const stage = $('#stage');
    stage.scrollTop = 0;
    if (a.viz.type === 'help') return renderHelp(a, animate);
    const vt = a.vizType || a.viz.type;
    const types = TQCharts.available(a.viz, a.rows);
    const pinned = isPinned(a);
    const art = document.createElement('article');
    art.className = 'artifact' + (animate ? ' enter' : '');
    art.innerHTML = `
      <div class="art-top">
        <div class="art-chips">${a.chips.map((c, i) => `<span class="chip ${i === 0 ? 'intent' : ''}">${esc(c)}</span>`).join('')}${a.edited ? '<span class="edited-badge">SQL נערך ידנית</span>' : ''}</div>
        <div class="art-actions">
          ${types.length > 1 ? `<div class="seg" role="group" aria-label="סוג תצוגה">${types.map((t) => `<button type="button" data-viz="${t}" class="${t === vt ? 'active' : ''}" title="${VIZ_NAME[t]}">${ICON[t]}</button>`).join('')}</div>` : ''}
          <button type="button" class="pin-btn ${pinned ? 'pinned' : ''}" data-pin>${ICON.pin}<span>${pinned ? 'הוצמד ללוח' : 'הצמד ללוח הבקרה'}</span></button>
        </div>
      </div>
      <div class="art-question"><span class="q-mark">״</span><span dir="auto">${esc(a.question)}</span></div>
      <div class="layer-label"><span class="n">1</span>תובנה עסקית</div>
      <section class="insight">
        <h2 class="insight-headline">${a.insight.headline}</h2>
        <ul class="insight-bullets">${a.insight.bullets.map((x) => `<li>${x}</li>`).join('')}</ul>
      </section>
      <div class="layer-label"><span class="n">2</span><span class="viz-label">ויזואליזציה · ${esc(VIZ_NAME[vt] || vt)}${!a.vizType ? ' · נבחרה אוטומטית' : ''}</span></div>
      <section class="viz"></section>
      <div class="layer-label"><span class="n">3</span>שקיפות אנליטית</div>
      <details class="drawer-x sql-drawer">
        <summary><span class="sql-badge">SQL</span><span>השאילתה שרצה מאחורי הקלעים</span><span class="meta">AlaSQL · ${a.rows.length} rows · ${a.ms != null ? a.ms.toFixed(1) : '—'} ms</span>${ICON.chev}</summary>
        <div class="sql-body">
          <pre class="sql-code">${highlightSQL(a.sql)}</pre>
          <div class="sql-toolbar">
            <button type="button" class="btn btn-dark" data-sql="edit">${ICON.edit} עריכה</button>
            <button type="button" class="btn btn-run" data-sql="run">${ICON.play} הרצה מחדש</button>
            <button type="button" class="btn btn-dark" data-sql="copy">${ICON.copy} העתקה</button>
            <span class="note">טבלאות: ${S.mode === 'builtin' ? 'sales, inventory' : 'uploaded'}</span>
          </div>
        </div>
      </details>
      <details class="drawer-x data-drawer">
        <summary>${ICON.table}<span>טבלת נתונים מלאה</span><span class="meta">${a.rows.length} rows</span>${ICON.chev}</summary>
        <div class="data-body"></div>
      </details>`;

    const old = stage.firstElementChild;
    const mount = () => {
      stage.innerHTML = '';
      stage.appendChild(art);
      renderViz(a, art);
      wireArtifact(a, art);
    };
    if (animate && old && !old.classList.contains('skeleton')) { old.classList.add('leave'); setTimeout(mount, 180); } else mount();
  }

  function renderViz(a, art) {
    const vt = a.vizType || a.viz.type;
    TQCharts.render($('.viz', art), a.viz, a.rows, { type: vt, labels: a.labels });
    $('.viz-label', art).textContent = `ויזואליזציה · ${VIZ_NAME[vt] || vt}${!a.vizType ? ' · נבחרה אוטומטית' : ''}`;
  }

  function wireArtifact(a, art) {
    $$('[data-viz]', art).forEach((btn) => btn.addEventListener('click', () => {
      a.vizType = btn.dataset.viz === a.viz.type ? null : btn.dataset.viz;
      $$('[data-viz]', art).forEach((b) => b.classList.toggle('active', b === btn));
      renderViz(a, art);
    }));
    $('[data-pin]', art).addEventListener('click', (e) => togglePin(a, e.currentTarget));

    const dataDrawer = $('.data-drawer', art);
    dataDrawer.addEventListener('toggle', () => {
      if (!dataDrawer.open || dataDrawer.dataset.ready) return;
      const body = $('.data-body', dataDrawer);
      TQCharts.render(body, { type: 'table' }, a.rows, { type: 'table', labels: a.labels });
      body.insertAdjacentHTML('beforeend', `<div class="sql-toolbar" style="background:#FBFAF7;border-top:1px solid var(--line)"><button type="button" class="btn btn-ghost" data-csv>${ICON.dl} הורדת CSV</button></div>`);
      $('[data-csv]', body).addEventListener('click', () => downloadCSV(a));
      dataDrawer.dataset.ready = '1';
    });

    const sqlBody = $('.sql-body', art);
    $('[data-sql="copy"]', art).addEventListener('click', () => {
      const txt = $('.sql-edit', art) ? $('.sql-edit', art).value : a.sql;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('השאילתה הועתקה'), () => toast('לא ניתן להעתיק'));
    });
    $('[data-sql="edit"]', art).addEventListener('click', (e) => {
      const pre = $('.sql-code', sqlBody);
      if (pre) {
        const ta = document.createElement('textarea');
        ta.className = 'sql-edit'; ta.spellcheck = false; ta.value = a.sql;
        ta.style.height = Math.max(200, pre.offsetHeight) + 'px';
        pre.replaceWith(ta);
        ta.focus();
        ta.addEventListener('keydown', (ev) => {
          if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); runSQL(a, art); }
          if (ev.key === 'Tab') { ev.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
        });
        e.currentTarget.innerHTML = `${ICON.x} ביטול`;
        $('.note', sqlBody).textContent = 'Ctrl/⌘ + Enter להרצה';
      } else {
        $('.sql-edit', sqlBody).replaceWith(Object.assign(document.createElement('pre'), { className: 'sql-code', innerHTML: highlightSQL(a.sql) }));
        e.currentTarget.innerHTML = `${ICON.edit} עריכה`;
        const err = $('.sql-error', sqlBody); if (err) err.remove();
      }
    });
    $('[data-sql="run"]', art).addEventListener('click', () => runSQL(a, art));
  }

  function runSQL(a, art) {
    const editor = $('.sql-edit', art);
    const sql = editor ? editor.value : a.sql;
    const sqlBody = $('.sql-body', art);
    const prevErr = $('.sql-error', sqlBody); if (prevErr) prevErr.remove();
    try {
      if (!/^\s*(--[^\n]*\n\s*)*(select|with)\b/i.test(sql)) throw new Error('ניתן להריץ שאילתות SELECT בלבד');
      const r = E.runCustom(sql, a.labels);
      const changed = sql.trim() !== a.sql.trim();
      Object.assign(a, { sql, rows: r.rows, ms: r.ms, vizType: null });
      if (changed) { a.viz = r.viz; a.insight = r.insight; a.edited = true; }
      renderArtifact(a, false);
      const card = $(`.ai-card[data-idx="${S.answers.indexOf(a)}"]`);
      if (card) card.outerHTML = aiCardHTML(a, S.answers.indexOf(a));
      markActiveCard();
      requestAnimationFrame(() => { const d = $('.sql-drawer', $('#stage')); if (d) d.open = true; });
      toast(changed ? `השאילתה רצה · ${r.rows.length} שורות · התצוגה עודכנה` : `הורץ מחדש · ${r.ms.toFixed(1)}ms`);
    } catch (e) {
      sqlBody.insertAdjacentHTML('beforeend', `<div class="sql-error">⚠ ${esc(e.message || String(e))}</div>`);
    }
  }

  function renderHelp(a, animate) {
    const stage = $('#stage');
    stage.innerHTML = `<article class="artifact ${animate ? 'enter' : ''}">
      <div class="art-chips"><span class="chip intent">עזרה</span></div>
      <div class="art-question"><span class="q-mark">״</span><span dir="auto">${esc(a.question)}</span></div>
      <h2 class="insight-headline">${a.insight.headline}</h2>
      <div class="help-grid">
        <div><strong>מדדים</strong>הכנסות · רווח גולמי · אחוז רווח · יחידות · מחיר ממוצע · שווי מלאי · ימי מלאי</div>
        <div><strong>חיתוכים</strong>רשת · קטגוריה · סניף · עיר · מוצר · מותג · בריאות מול רגיל · חודש</div>
        <div><strong>תקופות</strong>רבעון אחרון · Q2 2026 · 2025 · השנה · 6 חודשים אחרונים · לעומת אשתקד</div>
      </div>
      <div class="layer-label"><span class="n">→</span>אפשר להתחיל מכאן</div>
      <div class="suggestions">${a.followups.map((f) => `<button type="button" class="suggestion" data-q="${esc(f)}"><span>${esc(f)}</span></button>`).join('')}</div>
    </article>`;
  }

  // ------------------------------------------------------------ SQL highlight
  function highlightSQL(sql) {
    const KW = /^(SELECT|FROM|WHERE|AND|OR|NOT|IN|AS|GROUP|BY|ORDER|ASC|DESC|LIMIT|CASE|WHEN|THEN|ELSE|END|DISTINCT|HAVING|JOIN|LEFT|INNER|ON|BETWEEN|LIKE|IS|NULL|TOP|WITH|UNION|ALL|OFFSET)$/i;
    const FN = /^(SUM|COUNT|AVG|MIN|MAX|ROUND|NULLIF|COALESCE|ABS|UPPER|LOWER|LEN|LENGTH)$/i;
    return String(sql || '').split('\n').map((line) => {
      let out = '', m;
      const re = /(--.*$)|('(?:[^']|'')*')|(\[[^\]]*\])|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)|([(),*=<>+\-/]+)|(\s+)|(.)/g;
      while ((m = re.exec(line))) {
        if (m[1]) out += `<span class="tk-cmt">${esc(m[1])}</span>`;
        else if (m[2]) out += `<span class="tk-str">${esc(m[2])}</span>`;
        else if (m[3]) out += esc(m[3]);
        else if (m[4]) out += `<span class="tk-num">${m[4]}</span>`;
        else if (m[5]) out += KW.test(m[5]) ? `<span class="tk-kw">${m[5]}</span>` : FN.test(m[5]) ? `<span class="tk-fn">${m[5]}</span>` : esc(m[5]);
        else if (m[6]) out += `<span class="tk-op">${esc(m[6])}</span>`;
        else out += esc(m[0]);
      }
      return `<span class="ln">${out || ' '}</span>`;
    }).join('');
  }

  function downloadCSV(a) {
    if (!a.rows.length) return;
    const cols = Object.keys(a.rows[0]);
    const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + [cols.map((c) => cell(TQEngine.colLabel(c, a.labels))).join(','), ...a.rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'tradequery-result.csv' });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ------------------------------------------------------------ board
  function isPinned(a) { return !!(a.pinId && S.board.some((p) => p.id === a.pinId)); }
  function saveBoard() { store.set('tq.board.v1', S.board); updateBoardCount(true); }
  function updateBoardCount(bump) {
    const c = $('#boardCount');
    c.textContent = S.board.length;
    if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  }
  function syncPinButtons() {
    const a = S.answers[S.current];
    const btn = $('#stage [data-pin]');
    if (!a || !btn) return;
    const p = isPinned(a);
    btn.classList.toggle('pinned', p);
    btn.querySelector('span').textContent = p ? 'הוצמד ללוח' : 'הצמד ללוח הבקרה';
  }

  function togglePin(a) {
    if (isPinned(a)) {
      S.board = S.board.filter((p) => p.id !== a.pinId);
      a.pinId = null;
      toast('הוסר מלוח הבקרה');
    } else {
      a.pinId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      S.board.push({
        id: a.pinId, question: a.question, title: a.title, chips: a.chips, insight: a.insight, viz: a.viz,
        vizType: a.vizType || a.viz.type, rows: a.rows.slice(0, 300), labels: a.labels || null, sql: a.sql, note: '', at: Date.now()
      });
      toast('הוצמד ללוח הבקרה ✓');
    }
    saveBoard();
    syncPinButtons();
  }

  function renderBoard(staticCharts) {
    const grid = $('#boardGrid');
    $('#boardMeta').textContent = S.board.length
      ? `${S.board.length} פריטים · עודכן ${new Date(Math.max(...S.board.map((p) => p.at))).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' })}`
      : 'אספו גרפים מתשובות שונות לדוח אחד';
    if (!S.board.length) {
      grid.innerHTML = `<div class="board-empty"><svg class="ic big-ic" viewBox="0 0 24 24"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6"/></svg><h3>הלוח עדיין ריק</h3><p>לחצו על „הצמד ללוח הבקרה" בכל תשובה כדי לאסוף כאן גרפים לדף סיכום אחד — להדפסה או לייצוא PDF.</p></div>`;
      return;
    }
    grid.innerHTML = '';
    S.board.forEach((p, i) => {
      const wide = p.vizType === 'table' || (p.vizType === 'line' && p.viz.series) || (p.viz.series && p.rows.length > 12);
      const card = document.createElement('div');
      card.className = 'pin-card' + (wide ? ' wide' : '');
      card.innerHTML = `
        <div class="pin-card-top">
          <div class="art-chips">${p.chips.slice(0, 3).map((c, j) => `<span class="chip ${j === 0 ? 'intent' : ''}">${esc(c)}</span>`).join('')}</div>
          <div class="pc-actions">
            <button class="icon-btn sm" data-act="up" title="הזזה למעלה" ${i === 0 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
            <button class="icon-btn sm" data-act="down" title="הזזה למטה" ${i === S.board.length - 1 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
            <button class="icon-btn sm" data-act="remove" title="הסרה מהלוח">${ICON.x}</button>
          </div>
        </div>
        <div class="pin-card-q" dir="auto">${esc(p.question)}</div>
        <h3>${p.insight.headline}</h3>
        <div class="pin-viz"></div>
        <ul>${p.insight.bullets.slice(0, 2).map((x) => `<li>${x}</li>`).join('')}</ul>
        <div class="note" contenteditable="true" data-placeholder="הוסיפו הערה לדוח…">${esc(p.note || '')}</div>`;
      grid.appendChild(card);
      TQCharts.render($('.pin-viz', card), p.viz, p.rows, { type: p.vizType, compact: true, static: staticCharts, labels: p.labels, maxRows: 40 });
      $('.note', card).addEventListener('input', (e) => { p.note = e.target.textContent; store.set('tq.board.v1', S.board); });
      $$('[data-act]', card).forEach((btn) => btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'remove') {
          S.board.splice(i, 1);
          S.answers.forEach((a) => { if (a.pinId === p.id) a.pinId = null; });
        } else {
          const j = act === 'up' ? i - 1 : i + 1;
          [S.board[i], S.board[j]] = [S.board[j], S.board[i]];
        }
        saveBoard(); renderBoard();
      }));
    });
  }

  async function exportBoard() {
    if (!S.board.length) { toast('הוסיפו פריטים ללוח לפני הייצוא'); return; }
    $('#printTitle').textContent = $('#boardTitle').textContent.trim();
    $('#printDate').textContent = new Date().toLocaleDateString('he-IL', { dateStyle: 'long' });
    if (S.view !== 'board') setView('board');
    renderBoard(true);
    await sleep(80);
    // swap canvases for crisp images so every browser prints the charts
    $$('#boardGrid .chart-wrap canvas').forEach((cv) => {
      const img = new Image();
      img.className = 'print-img';
      img.src = cv.toDataURL('image/png');
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
      cv.style.display = 'none';
      cv.parentNode.appendChild(img);
    });
    window.print();
  }

  // ------------------------------------------------------------ schema drawer
  function openSchema() {
    const body = $('#schemaBody');
    let html = '';
    if (S.mode === 'builtin') {
      html += `<div class="schema-note">דאטה-סט מובנה של <b>מוצרי צריכה (FMCG)</b>: 5 רשתות שיווק, 20 סניפים, 8 קטגוריות ו-40 מוצרים, אוקטובר 2024 – ספטמבר 2026. כל הרשתות, המותגים והסניפים בדויים. הנתונים נשמרים בזיכרון הדפדפן בלבד.</div>`;
      Object.entries(TQData.schema).forEach(([t, cols]) => {
        html += `<div class="schema-table"><div class="schema-table-head"><code>${t}</code><span>${alasql.tables[t].data.length.toLocaleString('en-US')} rows</span></div>${cols.map(([c, ty, d]) => `<div class="schema-col"><code>${c}</code><span class="t">${ty}</span><span class="d">${esc(d)}</span></div>`).join('')}</div>`;
      });
    } else {
      const G = E.ctx.generic;
      html += `<div class="schema-note">הקובץ <b>${esc(S.fileName)}</b> נטען לטבלה <b>uploaded</b>. המערכת מזהה עמודות מספריות, טקסטואליות ותאריכים ומתאימה אליהן את השאלות.</div>
        <div class="schema-table"><div class="schema-table-head"><code>uploaded</code><span>${alasql.tables.uploaded.data.length.toLocaleString('en-US')} rows</span></div>${G.columns.map((c) => `<div class="schema-col"><code>${esc(c.name)}</code><span class="t">${c.type.toUpperCase()}</span>${c.type === 'text' ? `<span class="d">${c.card} ערכים ייחודיים${c.values ? ': ' + esc(c.values.slice(0, 4).join(', ')) + (c.card > 4 ? '…' : '') : ''}</span>` : ''}</div>`).join('')}</div>
        <button class="btn btn-ghost" id="backToBuiltin" type="button">${ICON.db} חזרה לדאטה-סט המובנה</button>`;
    }
    html += `<div class="schema-note" style="margin-top:14px">טיפ: אפשר לפתוח את לשונית ה-SQL בכל תשובה, לערוך את השאילתה ולהריץ מחדש — הגרף והתובנה יתעדכנו אוטומטית.</div>`;
    body.innerHTML = html;
    const back = $('#backToBuiltin');
    if (back) back.addEventListener('click', () => { loadBuiltin(); renderStarters(); closeSchema(); toast('חזרה לדאטה-סט המובנה'); });
    $('#schemaDrawer').classList.add('open');
    $('#schemaDrawer').setAttribute('aria-hidden', 'false');
  }
  function closeSchema() { $('#schemaDrawer').classList.remove('open'); $('#schemaDrawer').setAttribute('aria-hidden', 'true'); }

  // ------------------------------------------------------------ upload
  async function handleFile(file) {
    if (!window.XLSX) { toast('ספריית הקבצים לא נטענה'); return; }
    try {
      let wb;
      if (/\.(csv|tsv|txt)$/i.test(file.name)) wb = XLSX.read(await file.text(), { type: 'string', cellDates: true, raw: false });
      else wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      if (!raw.length) throw new Error('הגיליון הראשון ריק');
      const { rows, columns } = profile(raw);
      const builtinCols = TQData.schema.sales.map((c) => c[0]);
      if (builtinCols.every((c) => columns.some((x) => x.name === c))) {
        // same schema as the built-in sales table → full semantic engine
        alasql('DROP TABLE IF EXISTS sales'); alasql('CREATE TABLE sales'); alasql.tables.sales.data = rows;
        E.setGeneric(null); E.loadMeta(); S.mode = 'builtin';
        setSource(`${file.name} · ${rows.length.toLocaleString('en-US')} שורות (מבנה מכירות)`, true);
        renderStarters();
      } else {
        alasql('DROP TABLE IF EXISTS uploaded'); alasql('CREATE TABLE uploaded'); alasql.tables.uploaded.data = rows;
        E.setGeneric({ table: 'uploaded', columns, fileName: file.name });
        S.mode = 'generic';
        setSource(`${file.name} · ${rows.length.toLocaleString('en-US')} שורות · ${columns.length} עמודות`, true);
        const nums = columns.filter((c) => c.type === 'number'), txt = columns.filter((c) => c.type === 'text' && c.card >= 2 && c.card <= 50), dt = columns.find((c) => c.type === 'date');
        const st = [];
        if (nums[0] && txt[0]) st.push(['דירוג', `מה ה${nums[0].name} לפי ${txt[0].name}?`]);
        if (nums[0] && dt) st.push(['מגמה', `מה המגמה החודשית של ${nums[0].name}?`]);
        if (nums[0] && txt[1]) st.push(['נתח', `מה נתח ה${nums[0].name} לפי ${txt[1].name}?`]);
        if (nums[1] && txt[0]) st.push(['ממוצע', `מה ה${nums[1].name} הממוצע לפי ${txt[0].name}?`]);
        st.push(['סיכום', `כמה רשומות יש בקובץ?`]);
        renderStarters(st);
      }
      S.fileName = file.name;
      E.ctx.last = null;
      $$('.msg', $('#stream')).forEach((m) => m.remove());
      $('#welcome').hidden = false;
      toast(`הקובץ ${file.name} נטען · ${rows.length.toLocaleString('en-US')} שורות`);
      openSchema();
    } catch (e) {
      console.error(e);
      toast('שגיאה בטעינת הקובץ: ' + e.message);
    }
  }

  function profile(raw) {
    const keys = Object.keys(raw[0]);
    const names = [];
    const nameOf = {};
    keys.forEach((k, i) => {
      let n = String(k).trim().replace(/[[\]`]/g, '').replace(/\s+/g, ' ') || `col_${i + 1}`;
      if (/^__EMPTY/.test(n)) n = `col_${i + 1}`;
      while (names.includes(n)) n += '_' + (i + 1);
      names.push(n); nameOf[k] = n;
    });
    const toNum = (v) => {
      if (typeof v === 'number') return v;
      if (v == null || v === '') return null;
      const s = String(v).replace(/[₪$€,\s]/g, '').replace(/%$/, '');
      return /^-?\d*\.?\d+(e-?\d+)?$/i.test(s) ? +s : NaN;
    };
    const toDate = (v) => {
      if (v instanceof Date && !isNaN(v)) return v;
      if (typeof v !== 'string') return null;
      let m;
      if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(v))) return new Date(Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]));
      if ((m = /^(\d{4})-(\d{2})$/.exec(v))) return new Date(Date.UTC(+m[1], +m[2] - 1, 1));
      return null;
    };
    const iso = (d) => d.toISOString().slice(0, 10);
    const columns = keys.map((k) => {
      const vals = raw.map((r) => r[k]).filter((v) => v != null && v !== '');
      const n = vals.length || 1;
      const numOk = vals.filter((v) => !isNaN(toNum(v)) && toNum(v) !== null).length / n;
      const dateOk = vals.filter((v) => toDate(v)).length / n;
      let type = 'text';
      if (dateOk >= 0.9 && !vals.every((v) => typeof v === 'number')) type = 'date';
      else if (numOk >= 0.9) type = 'number';
      return { key: k, name: nameOf[k], type };
    });
    const rows = raw.map((r) => {
      const o = {};
      columns.forEach((c) => {
        const v = r[c.key];
        if (c.type === 'number') { const x = toNum(v); o[c.name] = x == null || isNaN(x) ? null : x; }
        else if (c.type === 'date') { const d = toDate(v); o[c.name] = d ? iso(d) : null; o[c.name + '__month'] = d ? iso(d).slice(0, 7) : null; }
        else o[c.name] = v == null ? null : String(v).trim();
      });
      return o;
    });
    columns.forEach((c) => {
      if (c.type !== 'text') return;
      const set = new Set(rows.map((r) => r[c.name]).filter((v) => v != null && v !== ''));
      c.card = set.size;
      if (set.size <= 300) c.values = [...set];
    });
    return { rows, columns: columns.map(({ key, ...rest }) => rest) };
  }

  // ------------------------------------------------------------ toast
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
