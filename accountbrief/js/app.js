/* =====================================================================
   AccountBrief AI — Application shell (calendar ⇄ chat ⇄ live canvas ⇄ board)
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
    ['תדרוך', 'פתח תדרוך ללקוח 1004'],
    ['מבצע', 'הכן הצעת מבצע ללקוח 1012'],
    ['לקוחות', 'איזה לקוח הציג את הצמיחה הגבוהה ביותר ברבעון האחרון?'],
    ['מלאי', 'אילו מוצרים בסיכון חוסר במלאי?'],
    ['EN', 'Revenue by account manager in 2026']
  ];
  const LOCKED_ASKS = ['מה הרווחיות שלו בקטגוריית הבריאות?', 'הכן לי הצעת מבצע', 'אילו קטגוריות צמחו הכי הרבה ברבעון האחרון?', 'מה מגמת ההכנסות החודשית?'];

  const S = { answers: [], current: -1, board: [], history: [], hIdx: -1, busy: false, view: 'canvas', mode: 'builtin', fileName: null, lock: null };
  const CAL = { meetings: [], source: 'פגישות דמו', active: null };
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
    S.board = store.get('ab.board.v1', []);
    $('#boardTitle').textContent = store.get('ab.boardTitle', 'לוח סיכום אנליטי');
    updateBoardCount(false);
    renderStarters();
    bindUI();
    bindCalendar();
    setMeetings(demoMeetings(), 'פגישות דמו');
    setInterval(renderMeetings, 60000);
    // opening artifact: the brief for the next meeting on today's calendar
    const now = Date.now();
    const next = CAL.meetings.find((m) => m.customer && m.end > now) || CAL.meetings.find((m) => m.customer);
    if (next) openBrief(next.customer.customer_id, next, { opening: true });
    $('#question').focus();
  }

  function loadBuiltin() {
    const t0 = performance.now();
    const { sales, inventory, customers } = TQData.build();
    ['sales', 'inventory', 'customers'].forEach((t) => { if (alasql.tables[t]) alasql(`DROP TABLE ${t}`); alasql(`CREATE TABLE ${t}`); });
    alasql.tables.sales.data = sales;
    alasql.tables.inventory.data = inventory;
    alasql.tables.customers.data = customers;
    E = E || TQEngine.create(alasql);
    E.setGeneric(null);
    const meta = E.loadMeta();
    S.mode = 'builtin'; S.fileName = null;
    setSource(`FMCG מובנה · ${customers.length} לקוחות · ${meta.rows.toLocaleString('en-US')} שורות מכירה`, false);
    $('#custList').innerHTML = customers.map((c) => `<option value="${c.customer_id} · ${esc(c.customer_name)}"></option>`).join('');
    if (CAL.meetings.length) { CAL.meetings.forEach(enrichMeeting); renderMeetings(); }
    console.info(`[AccountBrief] in-memory DB ready in ${(performance.now() - t0).toFixed(0)}ms`);
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
      setLock(null);
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
    $('#boardTitle').addEventListener('input', () => store.set('ab.boardTitle', $('#boardTitle').textContent.trim()));

    // schema drawer
    $('#sourcePill').addEventListener('click', openSchema);
    $('#closeDrawer').addEventListener('click', closeSchema);
    $('#schemaDrawer').addEventListener('click', (e) => { if (e.target.id === 'schemaDrawer') closeSchema(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSchema(); });

    // upload + drag & drop
    $('#fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; });
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

    window.addEventListener('afterprint', () => { document.documentElement.classList.remove('print-brief'); $$('.print-img').forEach((img) => img.remove()); $$('.chart-wrap canvas').forEach((c) => { c.style.display = ''; }); });
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

  const BRIEF_RE = /(תדרוך|דשבורד|brief|dashboard|360)/i;
  async function ask(q) {
    // "פתח תדרוך ללקוח 1004" or just "1004" opens the account brief instead of a chart answer
    const cust = S.mode === 'builtin' ? E.findCustomer(q) : null;
    const bare = q.replace(/[#?!.,״"׳']/g, '').replace(/(פתח|הכן|הצג|תן|לי|את|ה?תדרוך|דשבורד|brief|open|show|360°?|ל?לקוח|customer|account|של|for|ל-?)/gi, '').trim();
    if (cust && (BRIEF_RE.test(q) || /^\d{4}$/.test(bare) || bare === cust.customer_name)) {
      $('#welcome').hidden = true;
      openBrief(cust.customer_id, null);
      return;
    }
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
    think.innerHTML = `<div class="avatar">AB</div><div class="ai-body"><div class="thinking"><span class="dots"><i></i><i></i><i></i></span><span class="t">מפענח את השאלה…</span></div></div>`;
    stream.appendChild(think);
    scrollStream();

    const steps = ['מפענח כוונה, מדדים וחיתוכים', 'בונה שאילתת SQL', `מריץ על ${S.mode === 'builtin' ? E.ctx.meta.rows.toLocaleString('en-US') : 'הקובץ שהועלה'} שורות בזיכרון`, 'מנסח תובנה ובוחר ויזואליזציה'];
    showSkeleton(steps);
    let ans, err;
    for (let i = 0; i < steps.length; i++) {
      markStep(i); $('.thinking .t', think).textContent = steps[i] + '…';
      if (i === 2) { try { ans = E.ask(q, { customer: S.mode === 'builtin' ? S.lock : null }); } catch (e) { err = e; console.error(e); } }
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
    const lock = a.parse && a.parse.filters && a.parse.filters.customer && S.lock ? `<span class="lock-tag">לקוח #${a.parse.filters.customer[0]}</span>` : '';
    return `<div class="ai-card" data-idx="${idx}"><div class="ai-headline">${a.insight.headline}</div><div class="ai-meta">${lock}${meta}<span class="open-link">בקנבס ${ICON.arrow}</span></div></div>`;
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
    if (a.kind === 'brief') return renderBrief(a, animate);
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
  function saveBoard() { store.set('ab.board.v1', S.board); updateBoardCount(true); }
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
      $('.note', card).addEventListener('input', (e) => { p.note = e.target.textContent; store.set('ab.board.v1', S.board); });
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

  // ============================================================ meetings calendar
  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  function dayLabel(d) {
    const diff = Math.round((dayStart(d) - dayStart(new Date())) / 864e5);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'מחר';
    if (diff === -1) return 'אתמול';
    return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
  }

  function demoMeetings() {
    const n = new Date();
    const at = (off, h, m, dur) => {
      const start = new Date(n.getFullYear(), n.getMonth(), n.getDate() + off, h, m);
      return { start: start.getTime(), end: start.getTime() + (dur || 60) * 60000 };
    };
    return [
      { ...at(0, 9, 0, 30), title: 'שיחת מעקב הזמנות | לקוח 1009 (שוק עירוני הרצל)' },
      { ...at(0, 10, 30), title: 'פגישת סחר שנתית | לקוח 1004 (סופר גל דיזנגוף)', location: 'דיזנגוף 50, תל אביב' },
      { ...at(0, 14, 0), title: 'מו״מ מבצעים | לקוח 1012' },
      { ...at(0, 16, 30, 45), title: 'סקירת מדפים רבעונית | לקוח 1017' },
      { ...at(1, 11, 0), title: 'הצגת קטגוריית בריאות | לקוח 1013' }
    ];
  }

  function enrichMeeting(m) {
    m.customer = S.mode === 'builtin' && E ? E.findCustomer([m.title, m.location, m.description].filter(Boolean).join(' ')) : null;
    m.label = String(m.title || 'פגישה ללא כותרת').split('|')[0].trim();
    return m;
  }

  function setMeetings(list, source) {
    CAL.meetings = list.map(enrichMeeting).sort((a, z) => a.start - z.start);
    CAL.source = source;
    $('#calSource').textContent = source;
    $('#calGoogle').classList.toggle('on', /Google/.test(source));
    renderMeetings();
  }

  function renderMeetings() {
    const ol = $('#meetings');
    if (!ol) return;
    const now = Date.now();
    if (!CAL.meetings.length) {
      ol.innerHTML = '<li class="meetings-empty">אין פגישות להצגה. ייבאו יומן או התחברו ל-Google Calendar.</li>';
      return;
    }
    let lastDay = null;
    ol.innerHTML = CAL.meetings.map((m, i) => {
      const d = new Date(m.start);
      const day = dayLabel(d);
      const sep = day !== lastDay ? `<li class="day-sep">${esc(day)}</li>` : '';
      lastDay = day;
      const mins = Math.round((m.start - now) / 60000);
      let badge = '';
      if (!m.customer) badge = '<span class="m-badge nocust">ללא קוד לקוח</span>';
      else if (now >= m.start && now < m.end) badge = '<span class="m-badge now">עכשיו</span>';
      else if (mins > 0 && mins <= 120) badge = `<span class="m-badge soon">בעוד ${mins < 60 ? mins + ' דק׳' : Math.floor(mins / 60) + ':' + pad2(mins % 60) + ' ש׳'}</span>`;
      else if (m.end <= now) badge = '<span class="m-badge">הסתיימה</span>';
      const dur = m.end && m.allDay !== true ? Math.round((m.end - m.start) / 60000) : null;
      const cust = m.customer ? `<b>#${m.customer.customer_id}</b> · ${esc(m.customer.customer_name)}` : esc(m.location || 'לא זוהה לקוח בכותרת');
      return `${sep}<li><button type="button" class="meeting ${m.end <= now ? 'past' : ''} ${CAL.active === m ? 'active' : ''}" data-meeting="${i}">
        <span class="m-time">${m.allDay ? 'כל היום' : hhmm(d)}${dur ? `<small>${dur} דק׳</small>` : ''}</span>
        <span style="min-width:0"><div class="m-title">${esc(m.label)}</div><div class="m-cust">${cust}</div></span>
        ${badge}</button></li>`;
    }).join('');
  }

  function bindCalendar() {
    $('#meetings').addEventListener('click', (e) => {
      const b = e.target.closest('[data-meeting]');
      if (!b) return;
      const m = CAL.meetings[+b.dataset.meeting];
      if (!m.customer) { toast('לא מצאתי קוד לקוח בכותרת הפגישה. הוסיפו "לקוח 1004" לכותרת.'); return; }
      openBrief(m.customer.customer_id, m);
    });
    // quick customer search
    $('#quickSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#custSearch').value.trim();
      if (!v) return;
      const c = S.mode === 'builtin' ? E.findCustomer(v) : null;
      if (!c) { toast(`לא נמצא לקוח עבור "${v}"`); return; }
      $('#custSearch').value = '';
      $('#custSearch').blur();
      openBrief(c.customer_id, null);
    });
    $('#custSearch').addEventListener('change', () => {
      if (/^\d{4} · /.test($('#custSearch').value)) $('#quickSearch').requestSubmit();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); $('#custSearch').focus(); }
    });
    $('#lockClear').addEventListener('click', () => { setLock(null); toast('הסינון לפי לקוח נוקה. השאלות ירוצו על כל הנתונים.'); });

    // modals
    const open = (id) => { $(id).classList.add('open'); $(id).setAttribute('aria-hidden', 'false'); };
    const close = (el) => { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); };
    $('#calImport').addEventListener('click', () => open('#importModal'));
    $('#calGoogle').addEventListener('click', () => { $('#gClientId').value = store.get('ab.gClientId', ''); open('#googleModal'); });
    $$('.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(m); });
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal.open').forEach(close); });

    $('#icsInput').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const list = parseICS(await f.text());
        if (!list.length) throw new Error('לא נמצאו אירועים בקובץ');
        setMeetings(list, `קובץ ${f.name}`);
        close($('#importModal'));
        toast(`נטענו ${list.length} פגישות מהקובץ`);
      } catch (err) { toast('שגיאה בקריאת היומן: ' + err.message); }
    });
    $('#pasteApply').addEventListener('click', () => {
      const list = parsePasted($('#pasteMeetings').value);
      if (!list.length) { toast('לא זיהיתי פגישות. כתבו שורה כמו: 10:30 - פגישת סחר | לקוח 1004'); return; }
      setMeetings(list, 'רשימה מודבקת');
      close($('#importModal'));
      toast(`נטענו ${list.length} פגישות`);
    });
    $('#resetDemo').addEventListener('click', () => { setMeetings(demoMeetings(), 'פגישות דמו'); close($('#importModal')); });

    $('#gConnect').addEventListener('click', googleConnect);
    $('#gTokenFetch').addEventListener('click', () => {
      const t = $('#gToken').value.trim();
      if (!t) { gStatus('הדביקו Access Token.', 'err'); return; }
      fetchGoogleEvents(t);
    });
    $('#gSimulate').addEventListener('click', simulateGoogle);
  }

  // .ics → meetings (VEVENT with SUMMARY / DTSTART / DTEND / LOCATION / DESCRIPTION)
  function parseICS(text) {
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const unesc = (v) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
    const toDate = (v) => {
      const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
      if (!m) return null;
      const [, y, mo, d, h, mi, se, z] = m;
      if (h == null) return { t: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
      return { t: z ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se || 0)) : new Date(+y, +mo - 1, +d, +h, +mi, +(se || 0)).getTime(), allDay: false };
    };
    const events = [];
    let cur = null;
    lines.forEach((line) => {
      if (line === 'BEGIN:VEVENT') { cur = {}; return; }
      if (line === 'END:VEVENT') { if (cur && cur.start) events.push(cur); cur = null; return; }
      if (!cur) return;
      const i = line.indexOf(':');
      if (i < 0) return;
      const name = line.slice(0, i).split(';')[0].toUpperCase();
      const val = line.slice(i + 1);
      if (name === 'SUMMARY') cur.title = unesc(val);
      else if (name === 'LOCATION') cur.location = unesc(val);
      else if (name === 'DESCRIPTION') cur.description = unesc(val).slice(0, 400);
      else if (name === 'DTSTART') { const d = toDate(val); if (d) { cur.start = d.t; cur.allDay = d.allDay; } }
      else if (name === 'DTEND') { const d = toDate(val); if (d) cur.end = d.t; }
    });
    events.forEach((e) => { if (!e.end) e.end = e.start + 3600000; });
    const from = dayStart(new Date()), to = from + 14 * 864e5;
    const upcoming = events.filter((e) => e.end >= from && e.start < to);
    return (upcoming.length ? upcoming : events.sort((a, z) => z.start - a.start).slice(0, 20)).slice(0, 40);
  }

  // "10:30 - פגישת סחר | לקוח 1004" / "מחר 09:15 – ..." / "26/11 14:00 ..."
  function parsePasted(text) {
    const out = [];
    const base = new Date();
    String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      let off = 0, date = null;
      if (/^(מחר|tomorrow)/i.test(line)) off = 1;
      let m = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/.exec(line);
      if (m && !/^\d{1,2}:\d{2}/.test(m[0])) {
        const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : base.getFullYear();
        date = new Date(y, +m[2] - 1, +m[1]);
      }
      const t = /(\d{1,2}):(\d{2})(?:\s*[-–]\s*(\d{1,2}):(\d{2}))?/.exec(line);
      const d = date || new Date(base.getFullYear(), base.getMonth(), base.getDate() + off);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t ? +t[1] : 9, t ? +t[2] : 0).getTime();
      const end = t && t[3] ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), +t[3], +t[4]).getTime() : start + 3600000;
      const title = line.replace(/^(מחר|היום|tomorrow|today)\s*/i, '').replace(m && date ? m[0] : '', '').replace(t ? t[0] : '', '').replace(/^[\s\-–|:·]+/, '').trim();
      out.push({ start, end, title: title || line });
    });
    return out;
  }

  // Google Calendar API (Google Identity Services token flow, read-only scope)
  function gStatus(msg, cls) { const el = $('#gStatus'); el.textContent = msg; el.className = 'g-status ' + (cls || ''); }
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const sc = Object.assign(document.createElement('script'), { src, async: true, onload: res, onerror: () => rej(new Error('לא ניתן לטעון את ספריית ההתחברות של Google')) });
      document.head.appendChild(sc);
    });
  }
  async function googleConnect() {
    const clientId = $('#gClientId').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) { gStatus('הזינו Client ID תקין שמסתיים ב-apps.googleusercontent.com', 'err'); return; }
    store.set('ab.gClientId', clientId);
    try {
      gStatus('טוען את חלון ההתחברות של Google…');
      await loadScript('https://accounts.google.com/gsi/client');
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: (resp) => {
          if (resp.error) { gStatus('ההתחברות נכשלה: ' + resp.error, 'err'); return; }
          fetchGoogleEvents(resp.access_token);
        }
      });
      client.requestAccessToken();
    } catch (e) { gStatus(e.message, 'err'); }
  }
  async function fetchGoogleEvents(token) {
    gStatus('מושך פגישות מ-Google Calendar…');
    const from = new Date(dayStart(new Date())).toISOString(), to = new Date(dayStart(new Date()) + 7 * 864e5).toISOString();
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}`;
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 401) throw new Error('הטוקן לא תקף או שפג תוקפו');
      if (!r.ok) throw new Error(`Google החזיר שגיאה ${r.status}`);
      const data = await r.json();
      const list = (data.items || []).map((it) => {
        const allDay = !it.start.dateTime;
        const start = new Date(it.start.dateTime || it.start.date + 'T00:00:00').getTime();
        const end = new Date((it.end && (it.end.dateTime || it.end.date + 'T00:00:00')) || start + 3600000).getTime();
        return { start, end, allDay, title: it.summary || '(ללא כותרת)', location: it.location, description: it.description };
      });
      setMeetings(list, 'Google Calendar');
      gStatus(`סונכרנו ${list.length} פגישות ל-7 הימים הקרובים ✓`, 'ok');
      setTimeout(() => $$('.modal.open').forEach((m) => m.classList.remove('open')), 900);
    } catch (e) {
      gStatus('לא הצלחתי למשוך פגישות: ' + e.message + '. בדיקה אפשרית: האם הדומיין רשום ב-Authorized JavaScript origins?', 'err');
    }
  }
  async function simulateGoogle() {
    const head = $('.cal-head');
    const bar = Object.assign(document.createElement('div'), { className: 'sync-bar' });
    head.after(bar);
    const steps = ['מתחבר ל-Google Calendar (סימולציה)…', 'מאמת הרשאת calendar.readonly…', 'מושך אירועים ל-7 הימים הקרובים…'];
    for (const st of steps) { gStatus(st); await sleep(450); }
    const list = demoMeetings();
    const n = new Date();
    list.splice(2, 0, { start: new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0).getTime(), end: new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 45).getTime(), title: 'ישיבת צוות מכירות שבועית', location: 'חדר ישיבות 2' });
    list.push({ start: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 2, 10, 0).getTime(), end: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 2, 11, 0).getTime(), title: 'חידוש הסכם שנתי', description: 'customer #1002 · סופר גל חורב' });
    setMeetings(list, 'Google Calendar · סימולציה');
    bar.remove();
    gStatus(`סונכרנו ${list.length} פגישות (סימולציה) ✓`, 'ok');
    setTimeout(() => $$('.modal.open').forEach((m) => m.classList.remove('open')), 900);
  }

  // ============================================================ context lock
  function setLock(id) {
    S.lock = id || null;
    const chip = $('#lockChip');
    if (!S.lock) {
      chip.hidden = true;
      $('#question').placeholder = 'שאלו על מכירות, רווחיות, צמיחה או מלאי…';
      CAL.active = null; renderMeetings();
      return;
    }
    const c = E.ctx.meta.custById[S.lock];
    $('#lockLabel').textContent = `מסונן לפי לקוח #${c.customer_id} · ${c.customer_name}`;
    chip.hidden = false;
    $('#question').placeholder = `שאלו על ${c.customer_name}, למשל: מה הרווחיות שלו?`;
    E.ctx.last = null;
  }

  // ============================================================ 360° account brief
  function nextMeetingFor(id) {
    const now = Date.now();
    const ms = CAL.meetings.filter((m) => m.customer && m.customer.customer_id === id);
    return ms.find((m) => m.end > now) || ms[ms.length - 1] || null;
  }

  function openBrief(id, meeting, opts) {
    opts = opts || {};
    if (S.mode !== 'builtin') { toast('תדרוך לקוח זמין על הדאטה-סט המובנה. חזרו אליו דרך "מבנה הנתונים".'); return; }
    const br = E.brief(id);
    if (!br) { toast(`לא נמצא לקוח ${id}`); return; }
    meeting = meeting || nextMeetingFor(id);
    CAL.active = meeting || null;
    renderMeetings();
    setLock(id);
    if (S.view !== 'canvas') setView('canvas');
    const c = br.customer;
    const a = {
      kind: 'brief', brief: br, meeting, question: `תדרוך 360° · ${c.customer_name}`, title: 'תדרוך לפגישה',
      rows: [], viz: { type: 'brief' }, ms: br.ms, sql: null, chips: ['תדרוך 360°'],
      insight: { headline: `תדרוך מוכן: ${esc(c.customer_name)} <span class="num">#${c.customer_id}</span>`, bullets: br.talking.map((t) => t.text) },
      followups: LOCKED_ASKS.slice(0, 3)
    };
    S.answers.push(a);
    S.current = S.answers.length - 1;
    $('#welcome').hidden = true;
    $$('.followups', $('#stream')).forEach((f) => f.remove());
    const when = meeting ? `${dayLabel(new Date(meeting.start))} ${hhmm(new Date(meeting.start))} · ${meeting.label}` : 'ללא פגישה ביומן';
    const stream = $('#stream');
    stream.insertAdjacentHTML('beforeend', `
      <div class="msg msg-user"><div class="bubble">${opts.opening ? 'הפגישה הבאה שלי' : 'תדרוך ללקוח'} #${c.customer_id}</div></div>
      <div class="msg msg-ai"><div class="avatar">AB</div><div class="ai-body">
        <div class="ai-card" data-idx="${S.current}">
          <div class="ai-headline">הכנתי תדרוך ל<b>${esc(c.customer_name)}</b>: ${br.talking.length} נקודות לשיחה, ${br.points.length} פריטים לבדיקה.</div>
          <div class="ai-meta"><span class="lock-tag">לקוח #${c.customer_id}</span><span>${esc(when)}</span><span class="sep"></span><bdi>${br.ms.toFixed(0)}ms</bdi><span class="open-link">בקנבס ${ICON.arrow}</span></div>
        </div>
        <div class="followups"><div class="followups-label">${ICON.spark} מכאן כל שאלה תרוץ על הלקוח הזה</div>${a.followups.map((f) => `<button type="button" class="chip-q" data-q="${esc(f)}">${ICON.arrow}<span>${esc(f)}</span></button>`).join('')}</div>
      </div></div>`);
    markActiveCard();
    renderArtifact(a, true);
    updateHistoryNav();
    scrollStream();
    if (!opts.opening && window.matchMedia('(max-width: 860px)').matches) setTimeout(() => $('.canvas-area').scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
  }

  const TYPE_LABEL = { lost: 'הופסק', decline: 'ירידה חדה', white: 'White Space', stock: 'חוסר במלאי', excess: 'עודף מלאי' };
  const FMT = TQEngine.FMT;
  const fmtDate = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };

  function renderBrief(a, animate) {
    const stage = $('#stage');
    const br = a.brief, c = br.customer, k = br.kpi;
    const m = a.meeting;
    const utilCls = br.util >= 85 ? 'risk' : br.util >= 70 ? 'warn' : '';
    const lmLabel = TQCharts.prettyKey(br.lastMonth);
    const yoyCls = k.yoy == null ? '' : k.yoy >= 0 ? 'pos' : 'neg';
    const groups = { all: br.points.length, lostdecl: br.points.filter((p) => p.type === 'lost' || p.type === 'decline').length, white: br.points.filter((p) => p.type === 'white').length, stock: br.points.filter((p) => p.type === 'stock' || p.type === 'excess').length };
    const grpOf = (t) => (t === 'lost' || t === 'decline' ? 'lostdecl' : t === 'white' ? 'white' : 'stock');
    const art = document.createElement('article');
    art.className = 'artifact brief' + (animate ? ' enter' : '');
    art.innerHTML = `
      <div class="brief-top">
        <div class="art-chips"><span class="chip intent">תדרוך 360°</span><span class="chip">מכירות עד ${esc(lmLabel)}</span><span class="chip">מלאי נכון ל-${esc(fmtDate(E.ctx.meta.snapshot))}</span></div>
        <div class="art-actions"><button type="button" class="btn brief-btn" data-print><svg class="ic" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg> הכן דף תדרוך לפגישה (PDF)</button></div>
      </div>
      <section class="profile">
        <div class="cust-id"><div><small>לקוח</small><b>${c.customer_id}</b></div></div>
        <div style="min-width:0">
          <h2>${esc(c.customer_name)}</h2>
          <div class="profile-meta"><span>רשת <b>${esc(c.chain)}</b></span><span>עיר <b>${esc(c.city)}</b></span><span>מנהל תיק <b>${esc(c.account_manager)}</b></span><span>תנאי תשלום <b>${esc(c.payment_terms)}</b></span></div>
          ${m ? `<div class="next-meet"><svg class="ic" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>פגישה: ${esc(dayLabel(new Date(m.start)))} ${m.allDay ? '' : hhmm(new Date(m.start))} · ${esc(m.label)}</div>` : '<div class="next-meet" style="background:var(--bg-2);color:var(--muted)">אין פגישה מתוזמנת ביומן</div>'}
        </div>
        <div class="credit">
          <div class="credit-row"><span>ניצול מסגרת אשראי</span><b><bdi>${FMT.pct(br.util)}</bdi></b></div>
          <div class="meter ${utilCls}"><i style="width:${Math.min(100, br.util).toFixed(1)}%"></i></div>
          <small><bdi>${FMT.money(c.open_balance)}</bdi> בשימוש מתוך <bdi>${FMT.money(c.credit_limit)}</bdi></small>
          <div class="last-order ${br.daysSince > 45 ? 'warn' : ''}">הזמנה אחרונה: ${esc(fmtDate(c.last_order_date))} (לפני ${br.daysSince} ימים)</div>
        </div>
      </section>
      <div class="brief-kpis">
        <div class="kpi primary"><div class="kpi-label">מכירות מתחילת השנה (YTD)</div><div class="kpi-value"><bdi>${FMT.money(k.ytd_revenue)}</bdi></div><div class="kpi-sub">ינו׳–${esc(lmLabel.split(' ')[0])} ${esc(br.lastMonth.slice(0, 4))}</div></div>
        <div class="kpi"><div class="kpi-label">צמיחה מול תקופה מקבילה</div><div class="kpi-value ${yoyCls}"><bdi>${FMT.signedPct(k.yoy)}</bdi></div><div class="kpi-sub">מול <bdi>${FMT.money(k.ytd_prev_revenue)}</bdi> אשתקד</div></div>
        <div class="kpi"><div class="kpi-label">אחוז רווח גולמי ממוצע</div><div class="kpi-value"><bdi>${FMT.pct(k.ytd_margin_pct)}</bdi></div><div class="kpi-sub ${k.ytd_margin_pct < k.chain_margin_pct ? 'neg' : 'pos'}">ממוצע הרשת <bdi>${FMT.pct(k.chain_margin_pct)}</bdi></div></div>
        <div class="kpi"><div class="kpi-label">יתרת מלאי נוכחית</div><div class="kpi-value"><bdi>${FMT.money(k.stock_value)}</bdi></div><div class="kpi-sub ${k.shortage_items ? 'neg' : ''}">${k.shortage_items} פריטים בסיכון חוסר</div></div>
      </div>
      <div class="brief-grid">
        <div style="min-width:0"><div class="layer-label">מגמת רכישות חודשית · 12 חודשים מול אשתקד</div><div class="brief-trend"></div></div>
        <div style="min-width:0"><div class="layer-label">נקודות שיחה מומלצות</div><ol class="tp-list">${br.talking.map((t) => `<li class="${t.tone}">${t.text}</li>`).join('')}</ol></div>
      </div>
      <div class="layer-label">נקודות תורפה והזדמנויות לפגישה</div>
      <div class="pt-filter" role="group" aria-label="סינון">
        <button type="button" class="active" data-grp="all">הכול (${groups.all})</button>
        <button type="button" data-grp="lostdecl">ירדו או הופסקו (${groups.lostdecl})</button>
        <button type="button" data-grp="white">White Space (${groups.white})</button>
        <button type="button" data-grp="stock">התראות מלאי (${groups.stock})</button>
      </div>
      <div class="table-wrap"><table class="data-table points-table"><thead><tr><th>סוג</th><th>מוצר</th><th>קטגוריה</th><th>פירוט</th><th>פעולה מומלצת</th></tr></thead><tbody>
        ${br.points.map((p, i) => `<tr data-grp="${grpOf(p.type)}" class="${i >= 10 ? 'extra' : ''}"><td><span class="badge ${p.type}">${TYPE_LABEL[p.type]}</span></td><td class="prod">${esc(p.product)}</td><td class="cat">${esc(p.category)}</td><td><bdi>${esc(p.detail)}</bdi></td><td class="act">${esc(p.action)}</td></tr>`).join('') || '<tr><td colspan="5">לא נמצאו נקודות תורפה. הלקוח במצב טוב.</td></tr>'}
      </tbody></table></div>
      <div class="brief-ask">${LOCKED_ASKS.map((q) => `<button type="button" class="chip-q" data-q="${esc(q)}">${ICON.arrow}<span>${esc(q)}</span></button>`).join('')}</div>
      <details class="drawer-x sql-drawer brief-sql">
        <summary><span class="sql-badge">SQL</span><span>${Object.keys(br.queries).length} השאילתות שבנו את התדרוך</span><span class="meta">AlaSQL · ${br.ms.toFixed(1)} ms</span>${ICON.chev}</summary>
        <div class="sql-body">${Object.values(br.queries).map((q) => `<div class="sql-q-label">${esc(q.label)} · ${q.rows.length} שורות</div><pre class="sql-code">${highlightSQL(q.sql)}</pre>`).join('')}</div>
      </details>`;
    const old = stage.firstElementChild;
    const mount = () => {
      stage.innerHTML = '';
      stage.appendChild(art);
      stage.scrollTop = 0;
      TQCharts.renderBriefTrend($('.brief-trend', art), br.trend);
      $$('.pt-filter button', art).forEach((btn) => btn.addEventListener('click', () => {
        $$('.pt-filter button', art).forEach((x) => x.classList.toggle('active', x === btn));
        $$('.points-table tbody tr[data-grp]', art).forEach((tr) => { tr.hidden = btn.dataset.grp !== 'all' && tr.dataset.grp !== btn.dataset.grp; });
      }));
      $('[data-print]', art).addEventListener('click', () => printBrief(a));
    };
    if (animate && old && !old.classList.contains('skeleton')) { old.classList.add('leave'); setTimeout(mount, 180); } else mount();
  }

  async function printBrief(a) {
    const c = a.brief.customer;
    $('#printTitle').textContent = `תדרוך לפגישה · ${c.customer_name} (#${c.customer_id})`;
    $('#printDate').textContent = (a.meeting ? `פגישה: ${new Date(a.meeting.start).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' })} · ` : '') + `הופק ${new Date().toLocaleDateString('he-IL')}`;
    if (S.view !== 'canvas') setView('canvas');
    $$('#stage .points-table tbody tr').forEach((tr) => { tr.hidden = false; });
    document.documentElement.classList.add('print-brief');
    await sleep(60);
    $$('#stage .chart-wrap canvas').forEach((cv) => {
      const img = new Image();
      img.className = 'print-img';
      img.src = cv.toDataURL('image/png');
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
      cv.style.display = 'none';
      cv.parentNode.appendChild(img);
    });
    window.print();
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
