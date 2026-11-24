/* Shared player profile, levels, coins, shop, sounds and app install for all the party games.
   Everything is stored on this device only (localStorage). Every game works without this file. */
(function(){
  const KEY = "party-profile";
  const store = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch(e){} } };

  /* ---------- catalog ---------- */
  const FREE_EMOJI = ["🦊","🐸","🐼","🦄","🐙","🐯","🐵","🐧","🦁","🐨","🐷","🐲","🦖","🐝"];
  const SHOP_EMOJI = [
    { id: "👽", price: 100 }, { id: "🤖", price: 100 }, { id: "🦩", price: 150 }, { id: "🦈", price: 150 },
    { id: "🐉", price: 250 }, { id: "🦸", price: 250 }, { id: "🧙", price: 300 }, { id: "🥷", price: 300 },
    { id: "👻", price: 400 }, { id: "🤡", price: 400 }, { id: "👑", price: 750 }, { id: "💎", price: 1000 },
  ];
  const FREE_COLORS = ["#FF4D8D","#43B5FF","#FFC83D","#22D39A","#B38CFF","#FF7A4A","#7EE0FF","#FFA3C7"];
  const SHOP_COLORS = [
    { id: "#111111", price: 120, name: "שחור לילה" }, { id: "#FFFFFF", price: 120, name: "לבן קרח" },
    { id: "linear-gradient(135deg,#FFD700,#FF8C00)", price: 400, name: "זהב" },
    { id: "linear-gradient(135deg,#FF4D8D,#7B61FF,#43B5FF)", price: 500, name: "קשת" },
    { id: "linear-gradient(135deg,#0F2027,#2C5364)", price: 300, name: "חלל" },
  ];
  const DAILY = 50;

  /* ---------- profile ---------- */
  function load(){
    let p = null; try { p = JSON.parse(store.get(KEY) || "null"); } catch(e){}
    if (!p || typeof p !== "object") p = {};
    p.name = p.name || store.get("sb-name") || store.get("odds-name") || "";
    p.emoji = p.emoji || FREE_EMOJI[Math.floor(Math.random() * FREE_EMOJI.length)];
    p.color = p.color || FREE_COLORS[Math.floor(Math.random() * FREE_COLORS.length)];
    p.xp = +p.xp || 0; p.coins = +p.coins || 0; p.owned = Array.isArray(p.owned) ? p.owned : [];
    p.awarded = Array.isArray(p.awarded) ? p.awarded : []; p.games = +p.games || 0; p.wins = +p.wins || 0;
    if (p.muted == null) p.muted = false;
    return p;
  }
  function save(p){ store.set(KEY, JSON.stringify(p)); if (p.name){ store.set("sb-name", p.name); store.set("odds-name", p.name); } }
  /* level n needs 100 * n * (n + 1) / 2 xp in total: 100, 300, 600, 1000... */
  function levelOf(xp){ let n = 1; while (xp >= 100 * n * (n + 1) / 2) n++; const lo = 100 * (n - 1) * n / 2, hi = 100 * n * (n + 1) / 2; return { level: n, into: xp - lo, need: hi - lo, pct: Math.round((xp - lo) / (hi - lo) * 100) }; }
  const owns = (p, id) => FREE_EMOJI.includes(id) || FREE_COLORS.includes(id) || p.owned.includes(id);

  /* ---------- sounds (synthesized, no files) ---------- */
  let ac = null;
  function ctx(){ if (!ac){ const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C(); } if (ac.state === "suspended") ac.resume(); return ac; }
  function tone(freq, dur, type = "sine", vol = .18, delay = 0, slide = 0){
    const a = ctx(); if (!a) return; const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .05);
  }
  const SOUNDS = {
    tick: () => tone(880, .09, "square", .08),
    go: () => { tone(660, .12, "triangle"); tone(990, .25, "triangle", .2, .1); },
    pop: () => tone(520, .08, "sine", .14, 0, 260),
    lock: () => { tone(300, .06, "square", .08); tone(450, .08, "square", .08, .06); },
    reveal: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, .18, "triangle", .16, i * .07)); },
    hit: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 440 : 660, .14, "sawtooth", .12, i * .15); },
    miss: () => tone(400, .35, "sine", .14, 0, -200),
    win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .22, "triangle", .18, i * .12)); },
    coin: () => { tone(988, .08, "square", .1); tone(1319, .2, "square", .1, .08); },
    level: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .16, "square", .1, i * .08)); },
  };
  function sound(name){ try { if (load().muted) return; SOUNDS[name]?.(); } catch(e){} }

  /* ---------- small toast for rewards ---------- */
  function flash(html, ms = 2600){
    const d = document.createElement("div");
    d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:99;background:#14102a;color:#FFE45C;border:3px solid #000;border-radius:999px;padding:10px 18px;font:800 1rem Rubik,Heebo,system-ui,sans-serif;box-shadow:0 5px 0 #000;max-width:calc(100% - 32px);text-align:center;animation:partyIn .4s cubic-bezier(.3,1.6,.5,1)";
    d.innerHTML = html; document.body.appendChild(d); setTimeout(() => d.remove(), ms);
  }
  const st = document.createElement("style"); st.textContent = "@keyframes partyIn{from{transform:translate(-50%,-30px) scale(.8);opacity:0}}"; document.head.appendChild(st);

  /* ---------- rewards ---------- */
  function award({ key, xp = 0, coins = 0, win = false }){
    const p = load(); if (key && p.awarded.includes(key)) return null;
    const before = levelOf(p.xp).level;
    p.xp += xp; p.coins += coins; p.games += 1; if (win) p.wins += 1;
    if (key) p.awarded = [...p.awarded, key].slice(-60);
    save(p);
    const after = levelOf(p.xp).level;
    setTimeout(() => {
      if (after > before){ sound("level"); flash(`⬆️ עלית לרמה ${after}! +${xp} XP · +${coins} 🪙`, 3600); }
      else { sound("coin"); flash(`+${xp} XP · +${coins} 🪙`); }
    }, 900);
    return { before, after };
  }
  function dailyReady(){ const p = load(); return p.lastDaily !== new Date().toDateString(); }
  function claimDaily(){ const p = load(); if (p.lastDaily === new Date().toDateString()) return false; p.lastDaily = new Date().toDateString(); p.coins += DAILY; save(p); sound("coin"); return true; }
  function buy(id, price){ const p = load(); if (owns(p, id)) return "owned"; if (p.coins < price) return "poor"; p.coins -= price; p.owned.push(id); save(p); sound("coin"); return "ok"; }

  /* what a game stores on the player in a room, so everyone sees my look and level */
  function extras(){ const p = load(); return { emoji: p.emoji, color: p.color, lvl: levelOf(p.xp).level }; }
  /* avatar markup for a player record (falls back to the game's own avatars) */
  function avatarStyle(color){ return color && color.startsWith("linear") ? `background:${color}` : `background:${color}`; }

  /* ---------- install as an app ---------- */
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event("party-installable")); });
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  async function install(){
    if (deferred){ deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; return r?.outcome === "accepted" ? "installed" : "dismissed"; }
    return "manual";
  }
  function installHelp(){
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)){
      if (/CriOS|FxiOS|EdgiOS|Instagram|FBAN|WhatsApp/.test(ua)) return ["באייפון מתקינים רק מ‑Safari.", "פתחו את הלינק ב‑Safari (⋯ ← פתיחה בדפדפן).", "ואז עקבו אחרי השלבים שם."];
      return ["לוחצים על כפתור השיתוף ⬆️ (ריבוע עם חץ) בתחתית המסך.", "גוללים ובוחרים \"הוספה למסך הבית\".", "לוחצים \"הוסף\". האייקון יופיע במסך הבית ויפתח בלי שורת כתובת."];
    }
    if (/Android/.test(ua)) return ["פותחים את תפריט הדפדפן ⋮ למעלה.", "בוחרים \"התקנת אפליקציה\" או \"הוספה למסך הבית\".", "מאשרים. המשחקים יופיעו כאפליקציה."];
    return ["בכרום או Edge: לוחצים על אייקון ההתקנה בשורת הכתובת.", "או פשוט ממשיכים לשחק בדפדפן, הכל עובד אותו דבר."];
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

  /* tap sounds for game buttons, and the 🔊 toggle that every game shows in its top bar */
  document.addEventListener("click", e => {
    const m = e.target.closest('[data-act="mute"]');
    if (m){ const on = window.Party.toggleSound(); m.textContent = on ? "🔊" : "🔇"; return; }
    if (e.target.closest("button, .btn, [data-act]")) sound("pop");
  }, true);

  window.Party = { FREE_EMOJI, SHOP_EMOJI, FREE_COLORS, SHOP_COLORS, DAILY, load, save, levelOf, owns, sound, award, dailyReady, claimDaily, buy, extras, avatarStyle, flash, install, installHelp, standalone,
    toggleSound(){ const p = load(); p.muted = !p.muted; save(p); if (!p.muted) sound("pop"); return !p.muted; } };
})();
