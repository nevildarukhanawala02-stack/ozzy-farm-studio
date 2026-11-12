"use strict";
(() => {
  /* ---------- small helpers ---------- */
  const fast = () => !!window.__fast; // test hook only
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, cls, content) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content != null) { if (typeof content === "string") e.innerHTML = content; else e.append(content); }
    return e;
  };
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const pickN = (a, n) => shuffle(a).slice(0, n);
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* A "run" is one session or screen. Leaving it bumps `cur`, and every awaited helper
     then throws Cancel so stale flows stop quietly. */
  let cur = 0;
  class Cancel extends Error {}
  window.addEventListener("unhandledrejection", (e) => { if (e.reason instanceof Cancel) e.preventDefault(); });

  const sleep = (ms) => { const me = cur; return new Promise((r) => setTimeout(r, fast() ? 2 : ms)).then(() => { if (me !== cur) throw new Cancel(); }); };
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, fast() ? 5 : ms); timers.add(id); return id; };
  const every = (fn, ms) => { const id = setInterval(fn, fast() ? 40 : ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); timers.clear(); };

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ofs:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ofs:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const settings = Object.assign({ name: "Ozzy", phraseMode: "plan", rate: 0.8, voice: "", sfx: true }, store.get("settings", {}));
  const prog = Object.assign({ sessions: 0, days: [], attempts: 0, gallery: [], lessons: [], together: [], stats: {}, adapt: {}, adaptLog: [] }, store.get("prog", {}));
  const saveSettings = () => store.set("settings", settings);
  const saveProg = () => store.set("prog", prog);
  /* Ozzy has already done lesson 1, so it counts as finished and the plan starts from lesson 2.
     This runs once per device and never repeats, so "Restart the plan" still gives a real fresh start. */
  if (!prog.skipFirst) {
    prog.skipFirst = true;
    if (!prog.lessons.length) prog.lessons.push({ n: 1, day: "2000-01-01", ts: 0, pre: true });
    saveProg();
  }
  /* Lesson 1 counts as done, so its practice is credited in the report card too (colours, free painting, phrases),
     marked as "earlier". Only practice is credited, never accuracy, because that first session was not measured. */
  if (!prog.preStats) {
    prog.preStats = true;
    if (prog.lessons.some((l) => l.pre)) {
      ["colour", "splash", "phrases"].forEach((k) => { const st = prog.stats[k] || (prog.stats[k] = { r: 0, f: 0 }); st.pre = Math.max(st.pre || 0, 3); });
      saveProg();
    }
  }

  const idb = {
    db: null,
    open() {
      if (!this.db) {
        this.db = new Promise((res, rej) => {
          if (!window.indexedDB) return rej(new Error("no idb"));
          const r = indexedDB.open("ozzy", 2);
          r.onupgradeneeded = () => {
            ["recs", "media"].forEach((n) => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: "id", autoIncrement: true }); });
          };
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      }
      return this.db;
    },
    async tx(mode, fn, name) {
      const db = await this.open(); name = name || "recs";
      return new Promise((res, rej) => {
        const t = db.transaction(name, mode); const s = t.objectStore(name); const req = fn(s);
        t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
      });
    },
    add(rec) { return this.tx("readwrite", (s) => s.add(rec)); },
    all() { return this.tx("readonly", (s) => s.getAll()); },
    del(id) { return this.tx("readwrite", (s) => s.delete(id)); },
    clear() { return this.tx("readwrite", (s) => s.clear()); },
  };

  /* ---------- optional farm photos and sounds ---------- */
  let assets = { sounds: [], photos: [] };
  if (typeof fetch === "function") fetch("/api/assets").then((r) => r.json()).then((a) => { assets = a; }).catch(() => {});
  const assetFile = (kind, key) => {
    const f = (assets[kind] || []).find((n) => n.toLowerCase().startsWith(key + "."));
    return f ? "/" + kind + "/" + encodeURIComponent(f) : null;
  };
  const pic = (key, emoji) => { const f = assetFile("photos", key); return f ? '<img alt="" src="' + f + '">' : '<span class="emo">' + emoji + "</span>"; };

  /* ---------- sound effects (soft, synthesised) ---------- */
  let ac = null, master = null;
  function audio() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, t0, dur, type, vol) {
    const a = audio(); if (!a || !settings.sfx) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    chime() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.55, "sine", 0.17)); },
    fanfare() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.7, "sine", 0.16)); },
    tick() { tone(660, 0, 0.12, "sine", 0.14); },
    bell() { tone(880, 0, 1.1, "sine", 0.18); tone(1320, 0, 0.8, "sine", 0.08); },
    splat() {
      const a = audio(); if (!a || !settings.sfx) return;
      const len = Math.floor(a.sampleRate * 0.22), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      f.type = "lowpass"; f.frequency.value = 700; g.gain.value = 0.25; s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start();
    },
  };

  /* ---------- speech (the app's voice) ---------- */
  const hasTTS = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const stopSpeech = () => { if (hasTTS) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } };
  function pickVoice() {
    if (!hasTTS) return null;
    const vs = speechSynthesis.getVoices();
    if (settings.voice) { const v = vs.find((x) => x.voiceURI === settings.voice); if (v) return v; }
    return vs.find((v) => /en[-_]IN/i.test(v.lang)) || vs.find((v) => /en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  function say(text, opt) {
    const me = cur; opt = opt || {};
    return new Promise((res) => {
      if (!hasTTS) return setTimeout(res, fast() ? 2 : 500 + text.length * 60);
      stopSpeech();
      const u = new SpeechSynthesisUtterance(text), v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-IN";
      u.rate = opt.rate != null ? opt.rate : settings.rate; u.pitch = opt.pitch != null ? opt.pitch : 1.15;
      let done = false, to = 0;
      const fin = () => { if (done) return; done = true; clearTimeout(to); res(); };
      u.onend = fin; u.onerror = fin; to = setTimeout(fin, 1500 + text.length * 260);
      speechSynthesis.speak(u);
    }).then(() => { if (me !== cur) throw new Cancel(); });
  }
  function playFile(url) {
    const me = cur;
    return new Promise((res) => { const a = new Audio(url); a.onended = res; a.onerror = res; setTimeout(res, 6000); a.play().catch(res); })
      .then(() => { if (me !== cur) throw new Cancel(); });
  }

  /* ---------- microphone: optional, never required ---------- */
  let micStream = null, micDenied = false;
  const micOK = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  async function getMic() {
    if (micStream) return micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
      return micStream;
    } catch (e) { micDenied = true; throw e; }
  }
  async function record(maxMs, onLevel) {
    const stream = await getMic(), a = audio();
    let src = null, an = null, raf = 0;
    if (a) {
      src = a.createMediaStreamSource(stream); an = a.createAnalyser(); an.fftSize = 512; src.connect(an);
      const data = new Uint8Array(an.fftSize);
      const loop = () => { an.getByteTimeDomainData(data); let s = 0; for (const v of data) { const d = (v - 128) / 128; s += d * d; } onLevel && onLevel(Math.sqrt(s / data.length)); raf = requestAnimationFrame(loop); };
      loop();
    }
    const chunks = [], mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((res) => { mr.onstop = () => res(new Blob(chunks, { type: mr.mimeType || "audio/mp4" })); });
    mr.start();
    const timer = setTimeout(() => { if (mr.state === "recording") mr.stop(); }, maxMs);
    return {
      stop() { if (mr.state === "recording") mr.stop(); },
      done: stopped.then((b) => { cancelAnimationFrame(raf); clearTimeout(timer); try { src && src.disconnect(); } catch (e) { /* ignore */ } return b; }),
    };
  }
  /* Quiet voices are normalised up, so a whisper plays back clearly. */
  async function playBoosted(blob) {
    const a = audio(); if (!a) return;
    try {
      const buf = await a.decodeAudioData(await blob.arrayBuffer());
      let peak = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
      const g = a.createGain(); g.gain.value = Math.min(10, 0.7 / Math.max(peak, 0.01));
      const s = a.createBufferSource(); s.buffer = buf; s.connect(g); g.connect(a.destination); s.start();
      await new Promise((r) => setTimeout(r, buf.duration * 1000 + 150));
    } catch (e) { /* playback is a bonus */ }
  }
  async function saveRec(word, blob) { try { return await idb.add({ word, ts: Date.now(), blob, type: blob.type }); } catch (e) { return null; } }

  /* ---------- icons ---------- */
  const W = 'fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
  const ICON = {
    arrow: '<svg viewBox="0 0 48 48"><path d="M10 24h26M26 12l12 12-12 12" ' + W + "/></svg>",
    up: '<svg viewBox="0 0 48 48"><path d="M24 40V10M11 23l13-13 13 13" ' + W + "/></svg>",
    mic: '<svg viewBox="0 0 48 48"><rect x="17" y="5" width="14" height="26" rx="7" fill="#fff"/><path d="M10 22v2a14 14 0 0 0 28 0v-2M24 38v6" ' + W + "/></svg>",
    speaker: '<svg viewBox="0 0 48 48"><path d="M8 19h8l10-8v26l-10-8H8z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M32 17a10 10 0 0 1 0 14M37 12a17 17 0 0 1 0 24" ' + W + "/></svg>",
    home: '<svg viewBox="0 0 48 48"><path d="M7 24L24 9l17 15M13 21v18h22V21" ' + W + "/></svg>",
    gallery: '<svg viewBox="0 0 48 48"><rect x="7" y="9" width="34" height="30" rx="4" ' + W + '/><path d="M11 34l10-12 7 8 4-5 7 9" ' + W + '/><circle cx="32" cy="18" r="3" fill="#fff"/></svg>',
    brush: '<svg viewBox="0 0 100 100"><path d="M72 12l16 16-38 38-16-16z" fill="#fff"/><path d="M34 50c-11 0-18 8-18 17 0 8-5 13-10 15 15 7 38 3 45-14z" fill="#F6C445"/></svg>',
  };

  /* ---------- the painting that fills in as he plays ---------- */
  const INK = "#2A2D4A";
  const REGIONS = [
    { c: "#8ED1F0", s: '<rect x="0" y="0" width="400" height="300"/>' },
    { c: "#F6C445", s: '<circle cx="335" cy="55" r="32"/>' },
    { c: "#7CBF5E", s: '<path d="M0 205Q90 150 200 195T400 175V300H0Z"/>' },
    { c: "#D4503A", s: '<path d="M70 120H170V215H70Z"/>' },
    { c: "#8A5A44", s: '<path d="M58 124L120 78L182 124Z"/>' },
    { c: "#F6C445", s: '<rect x="104" y="160" width="32" height="55"/>' },
    { c: "#4E9A4E", s: '<g><rect x="262" y="172" width="16" height="48"/><circle cx="270" cy="140" r="40"/></g>' },
    { c: "#B98B5E", s: '<g><rect x="10" y="262" width="170" height="8"/><rect x="10" y="278" width="170" height="8"/><rect x="18" y="252" width="9" height="40"/><rect x="58" y="252" width="9" height="40"/><rect x="98" y="252" width="9" height="40"/><rect x="138" y="252" width="9" height="40"/></g>' },
    { c: "#E86FA3", s: '<g><path d="M205 290V268M230 290V258M255 290V270" fill="none"/><circle cx="205" cy="264" r="10"/><circle cx="230" cy="254" r="10"/><circle cx="255" cy="266" r="10"/></g>' },
    { c: "#F2A33A", s: '<g><ellipse cx="320" cy="258" rx="28" ry="21"/><circle cx="344" cy="238" r="12"/></g>' },
  ];
  /* Little extras join the painting as he learns: the animal he met, the number story, the face he matched. */
  const EXSLOTS = [[330, 214, 36], [212, 236, 34], [118, 48, 38], [232, 62, 36]];
  function paintingSVG(fills, newIdx, extras) {
    const parts = REGIONS.map((r, i) => '<g class="rg' + (i === newIdx ? " new" : "") + '" fill="' + (fills[i] || "#fff") + '" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round">' + r.s + "</g>").join("");
    const ex = (extras || []).slice(0, EXSLOTS.length).map((x, i) => {
      const [cx, cy, sz] = EXSLOTS[i];
      return x.c ? '<circle class="ex" cx="' + cx + '" cy="' + cy + '" r="15" fill="' + x.c + '" stroke="' + INK + '" stroke-width="3"/>'
        : '<text class="ex" x="' + cx + '" y="' + cy + '" font-size="' + sz + '" text-anchor="middle" dominant-baseline="central">' + x.e + "</text>";
    }).join("");
    return '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Painting">' + parts + "<g>" + ex + "</g></svg>";
  }

  /* ---------- screen plumbing ---------- */
  const stage = $("#stage"), thumb = $("#thumb"), homeBtn = $("#homeBtn");
  homeBtn.innerHTML = ICON.home;
  let fills = Array(REGIONS.length).fill(null);
  const zoom = () => {
    if ($("#app > .overlay")) return;
    const o = h("div", "overlay", '<div class="bigart">' + paintingSVG(fills, -1, session.extras) + "</div>");
    o.onclick = () => o.remove(); $("#app").append(o);
  };
  thumb.setAttribute("role", "button"); thumb.tabIndex = 0; thumb.setAttribute("aria-label", "Zoom in on the painting");
  thumb.onclick = zoom; thumb.onkeydown = (e) => { if (e.key === "Enter") zoom(); };

  function show(node) { document.querySelectorAll("#app > .overlay").forEach((o) => o.remove()); clearTimers(); stopSpeech(); stage.replaceChildren(node); node.classList.add("enter"); }
  function paintNext(color) {
    const i = fills.findIndex((f) => !f); if (i < 0) return;
    fills[i] = color || REGIONS[i].c;
    thumb.innerHTML = paintingSVG(fills, i, session.extras);
    thumb.classList.remove("bump"); void thumb.offsetWidth; thumb.classList.add("bump");
  }
  function confetti() {
    if (reduced()) return;
    const box = h("div", "confetti"), cols = ["#E23D3D", "#F6C21B", "#2F6FDE", "#3BA55D", "#F06FA8", "#F28A1E"];
    for (let i = 0; i < 16; i++) {
      const d = h("i"); d.style.cssText = "left:" + (5 + rnd(90)) + "%;background:" + cols[i % 6] + ";animation-delay:" + rnd(300) + "ms;--dx:" + (rnd(60) - 30) + "px";
      box.append(d);
    }
    stage.append(box); later(() => box.remove(), 1900);
  }
  async function rewardPaint(color) {
    paintNext(color); sfx.chime(); confetti();
    await say("Well done!", { rate: 0.8 });
    await sleep(500);
  }
  function holdButton(el, ms, fn) {
    let t = 0;
    const stop = () => { clearTimeout(t); el.classList.remove("holding"); };
    el.addEventListener("pointerdown", () => { el.classList.add("holding"); t = setTimeout(() => { stop(); fn(); }, fast() ? 5 : ms); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, stop));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") fn(); });
  }

  /* ---------- reusable: optional "say it" + next ---------- */
  function makeMic(word) {
    const wrap = h("div", "mic"), ring = h("i", "ring"), b = h("button", "round micbtn", ICON.mic);
    b.setAttribute("aria-label", "Say it"); wrap.append(ring, b);
    const api = { el: wrap, attempts: 0, onStart() {}, onAttempt() {} };
    let rec = null;
    b.onclick = async () => {
      if (rec) { rec.stop(); return; }
      try {
        api.onStart(); b.classList.add("rec");
        rec = await record(4500, (l) => { ring.style.transform = "scale(" + (1 + Math.min(1.4, l * 18)) + ")"; });
        const blob = await rec.done; rec = null;
        b.classList.remove("rec"); ring.style.transform = "";
        api.attempts++; prog.attempts++; saveProg();
        if (blob && blob.size > 0) { saveRec(word, blob).then((id) => { if (id != null) session.recs[word] = id; }); await playBoosted(blob); }
        api.onAttempt();
      } catch (e) { rec = null; b.classList.remove("rec"); wrap.remove(); }
    };
    return api;
  }
  function respond(parent, opt) {
    const me = cur;
    return new Promise((res) => {
      const bar = h("div", "respond"), next = h("button", "round next", ICON.arrow);
      next.setAttribute("aria-label", "Next");
      let tm = 0;
      const fin = () => { clearTimeout(tm); if (me === cur) res(); };
      const arm = () => { clearTimeout(tm); tm = later(fin, opt.idleMs || 45000); };
      if (micOK() && !micDenied) {
        const m = makeMic(opt.word); m.onStart = () => clearTimeout(tm); m.onAttempt = arm; bar.append(m.el);
      }
      bar.append(next); next.onclick = fin; parent.append(bar); arm();
    });
  }

  /* ---------- reusable: pick the right picture (errorless: wrong taps just wobble) ---------- */
  function choiceRound(parent, o) {
    return new Promise((resolve) => {
      const me = cur; let wrong = 0, done = false;
      const row = h("div", "choices " + (o.cls || "")), rep = h("button", "replay", ICON.speaker);
      rep.setAttribute("aria-label", "Hear it again");
      const cards = o.options.map((opt, i) => {
        const b = h("button", "card", opt.node); if (i === o.target) b.dataset.correct = "1";
        b.onclick = async () => {
          if (done) return;
          if (i === o.target) { done = true; clearTimers(); const first = wrong === 0 && !cards[o.target].classList.contains("hint"); if (o.skill) track(o.skill, first); b.classList.add("win"); sfx.tick(); resolve({ i, first }); return; }
          wrong++; b.classList.remove("wobble"); void b.offsetWidth; b.classList.add("wobble");
          if (wrong >= 2) cards[o.target].classList.add("hint");
          try { await (opt.say ? opt.say() : null); } catch (e) { /* cancelled */ }
        };
        return b;
      });
      row.append(...cards); parent.append(rep, row);
      rep.onclick = () => { o.prompt().catch(() => {}); };
      if (o.hintFirst) cards[o.target].classList.add("hint");
      let n = 0;
      every(() => { if (done || me !== cur) return; n++; o.prompt().catch(() => {}); if (n >= 2) cards[o.target].classList.add("hint"); }, 9000);
    });
  }

  /* ---------- the plan: which lesson is next, and what it asks of him ---------- */
  const C = window.CURRICULUM;
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  /* One new lesson per day played. Extra play the same day is "bonus" and never advances the plan. */
  function planNow() {
    const done = prog.lessons.length, total = C.LESSONS.length, last = prog.lessons[done - 1];
    if (done >= total) return { lesson: C.freeLesson(C.WEEKS.length), bonus: true, complete: true };
    if (last && last.day === today()) return { lesson: C.freeLesson(C.LESSONS[done - 1].week), bonus: true };
    return { lesson: C.LESSONS[done], bonus: false };
  }
  let session = { lesson: C.freeLesson(1), bonus: true, mem: [], extras: [], recs: {} };
  const refreshThumb = () => { if (!thumb.hidden) thumb.innerHTML = paintingSVG(fills, -1, session.extras); };
  /* Every painting remembers up to three words from the day, and gets a little extra drawn in. */
  function remember(m) {
    const x = m.k === "phrase" ? (m.first ? 2 : 1) : (m.first ? 3 : 1), old = session.mem.find((y) => y.w === m.w);
    if (old) { old.x = Math.max(old.x, x); return; }
    session.mem.push({ w: m.w, k: m.k, e: m.e || null, q: m.q || null, vw: m.vw || m.w, x });
    if (m.extra && m.e && session.extras.length < EXSLOTS.length) { session.extras.push(m.e.charAt(0) === "#" ? { c: m.e } : { e: m.e }); refreshThumb(); }
  }
  function pickMemory() {
    const c = session.mem.map((m) => Object.assign({}, m, { sc: m.x + (session.recs[m.vw] ? 2 : 0) + Math.random() * 0.5 })).sort((a, b) => b.sc - a.sc);
    const out = [], kinds = new Set();
    c.forEach((m) => { if (out.length < 3 && !kinds.has(m.k)) { out.push(m); kinds.add(m.k); } });
    c.forEach((m) => { if (out.length < 3 && !out.includes(m)) out.push(m); });
    return out.map(({ w, k, e, q, vw }) => ({ w, k, e, q, vw }));
  }
  /* The week's settings, nudged by what the app has learned about him (see adaptAfterSession). */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cfg = () => {
    const b = session.lesson.cfg, a = prog.adapt || {};
    return Object.assign({}, b, { colours: clamp(b.colours + (a.colours || 0), 3, 7), animals: clamp(b.animals + (a.animals || 0), 3, 6),
      faces: clamp(b.faces + (a.faces || 0), 2, 4), crows: b.crows ? clamp(b.crows + (a.crows || 0), 2, 5) : b.crows });
  };
  const track = (skill, first) => {
    const s = prog.stats[skill] || (prog.stats[skill] = { r: 0, f: 0 });
    s.r++; if (first) s.f++;
    s.recent = (s.recent || []).concat(first ? 1 : 0).slice(-10);
    saveProg();
  };
  /* Self-learning, kept gentle: when he finds the right picture straight away on almost every one of the last 10 rounds of a skill,
     that skill gets a little harder (one more picture to choose from). When he mostly needs help, it gets a little easier.
     Each change is logged so the grown-ups can see it, and needs fresh evidence before the next change. */
  const LEVERS = { colour: ["colours", "Colours", "colour to choose from"], sound: ["animals", "Animal sounds", "animal to choose from"],
    feelings: ["faces", "Feelings", "face to choose from"], crows: ["crows", "Number stories", "crow in the biggest story"] };
  function adaptAfterSession() {
    Object.keys(LEVERS).forEach((skill) => {
      const s = prog.stats[skill], rec = s && s.recent; if (!rec || rec.length < 9) return;
      const ratio = rec.reduce((a, b) => a + b, 0) / rec.length, key = LEVERS[skill][0], cur0 = prog.adapt[key] || 0;
      let dir = 0; if (ratio >= 0.85 && cur0 < 2) dir = 1; else if (ratio <= 0.35 && cur0 > -2) dir = -1;
      if (!dir) return;
      prog.adapt[key] = cur0 + dir; s.recent = [];
      prog.adaptLog.push({ ts: Date.now(), skill, label: LEVERS[skill][1], dir, ratio: Math.round(ratio * 100), offset: prog.adapt[key], what: (dir > 0 ? "one more " : "one fewer ") + LEVERS[skill][2] });
      if (prog.adaptLog.length > 40) prog.adaptLog.shift();
    });
    saveProg();
  }
  const firstTime = (skill) => ((prog.stats[skill] || {}).r || 0) < 3;
  const askWhere = (w) => (cfg().questions ? "Where is the " + w + "?" : w);
  const askColour = (w) => (cfg().questions ? "Where is " + w + "?" : w);
  const askFace = (w) => (cfg().questions ? "Which face is " + w + "?" : w);
  const phraseLen = () => (settings.phraseMode === "2" ? 2 : settings.phraseMode === "3" ? 3 : cfg().phraseLen);
  /* Three counted rounds that build up to the week's limit: 3 -> 1,2,3; 5 -> 3,4,5; 10 -> 6,8,10 */
  const countFor = (r) => { const m = cfg().count, step = m > 5 ? 2 : 1; return Math.max(1, m - (2 - r) * step); };

  /* ---------- activities ---------- */
  const COLORS = [
    { n: "red", hex: "#E23D3D" }, { n: "blue", hex: "#2F6FDE" }, { n: "yellow", hex: "#F6C21B" }, { n: "green", hex: "#3BA55D" },
    { n: "orange", hex: "#F28A1E" }, { n: "pink", hex: "#F06FA8" }, { n: "purple", hex: "#8A4FD0" },
  ];
  const potSVG = (hex) => '<svg viewBox="0 0 100 100"><path d="M14 32V78Q14 93 50 93T86 78V32Z" fill="' + hex + '" stroke="' + INK + '" stroke-width="4"/><ellipse cx="50" cy="32" rx="36" ry="11" fill="' + hex + '" stroke="' + INK + '" stroke-width="4"/><ellipse cx="50" cy="32" rx="36" ry="11" fill="#fff" opacity=".4"/><path d="M32 22Q50 4 68 22" fill="none" stroke="' + INK + '" stroke-width="4"/></svg>';
  const BLOB = "M100 18C130 10 168 30 178 62C192 98 170 140 138 160C108 182 64 176 40 150C14 122 18 78 42 52C58 32 78 22 100 18Z";

  /* one splash of paint on a pad (used by free painting and turn-taking) */
  function dab(pad, color, e) {
    const r = pad.getBoundingClientRect();
    const x = e && e.clientX ? e.clientX - r.left : r.width * (0.2 + Math.random() * 0.6);
    const y = e && e.clientY ? e.clientY - r.top : r.height * (0.2 + Math.random() * 0.6);
    const d = h("i", "dab"); d.style.cssText = "left:" + x + "px;top:" + y + "px;background:" + color; pad.append(d);
  }

  async function actColour() {
    const set = COLORS.slice(0, cfg().colours), used = [];
    for (let r = 0; r < 3; r++) {
      const target = shuffle(set.filter((c) => !used.includes(c)))[0] || set[0]; used.push(target);
      const opts = shuffle([target, ...pickN(set.filter((c) => c !== target), 2)]);
      const n = h("div", "scene"), board = h("div", "board"); n.append(board); show(n);
      const prompt = () => say(askColour(target.n), { rate: 0.7 });
      prompt().catch(() => {});
      const cr = await choiceRound(n, {
        cls: "pots", skill: "colour", options: opts.map((c) => ({ node: potSVG(c.hex), say: () => say(c.n, { rate: 0.7 }) })),
        target: opts.indexOf(target), prompt, hintFirst: firstTime("colour") && r === 0,
      });
      remember({ w: target.n, k: "colour", e: target.hex, q: target.n, first: cr.first, extra: true });
      board.innerHTML = '<svg class="splat" viewBox="0 0 200 200"><path d="' + BLOB + '" fill="' + target.hex + '"/></svg><div class="bword">' + target.n + "</div>";
      sfx.splat(); await say(target.n + "!", { rate: 0.75 });
      await respond(n, { word: target.n });
      await rewardPaint(target.hex);
    }
  }

  async function actSplash() {
    const set = COLORS.slice(0, Math.max(3, cfg().colours));
    let k = 0;
    for (let r = 0; r < 3; r++) {
      const n = h("div", "scene"), pad = h("button", "splashpad"); pad.setAttribute("aria-label", "Paint here"); n.append(pad); show(n);
      say(r === 0 ? "Tap to paint!" : "More paint!", { rate: 0.8 }).catch(() => {});
      await new Promise((res) => {
        let t = 0; const me = cur;
        pad.onclick = (e) => {
          const c = set[k++ % set.length]; dab(pad, c.hex, e); sfx.splat(); say(c.n, { rate: 0.8 }).catch(() => {});
          if (++t >= 2) res();
        };
        every(() => { if (me === cur && t === 0) pad.classList.toggle("nudge"); }, 2500);
      });
      track("splash", true); await sleep(500); await rewardPaint();
    }
  }

  const ANIMALS = {
    dog: { e: "🐕", s: "Woof woof!", p: 0.8, w: "woof" }, cat: { e: "🐈", s: "Meow!", p: 1.6, w: "meow" },
    hen: { e: "🐔", s: "Cluck cluck!", p: 1.5, w: "cluck" }, hamster: { e: "🐹", s: "Squeak squeak!", p: 2, w: "squeak" },
    cow: { e: "🐄", s: "Moo!", p: 0.4, w: "moo" }, sheep: { e: "🐑", s: "Baa!", p: 1.2, w: "baa" },
  };
  const animalSound = (k) => { const f = assetFile("sounds", k); return f ? playFile(f) : say(ANIMALS[k].s, { pitch: ANIMALS[k].p, rate: 0.85 }); };

  async function actSound() {
    const keys = Object.keys(ANIMALS).slice(0, cfg().animals), used = [];
    for (let r = 0; r < 3; r++) {
      const target = shuffle(keys.filter((k) => !used.includes(k)))[0] || keys[0]; used.push(target);
      const opts = shuffle([target, ...pickN(keys.filter((k) => k !== target), 2)]);
      const n = h("div", "scene"); show(n);
      const prompt = () => animalSound(target);
      prompt().catch(() => {});
      const cr = await choiceRound(n, {
        skill: "sound", options: opts.map((k) => ({ node: pic(k, ANIMALS[k].e), say: () => animalSound(k) })),
        target: opts.indexOf(target), prompt, hintFirst: firstTime("sound") && r === 0,
      });
      remember({ w: target, k: "animal", e: ANIMALS[target].e, q: target, vw: ANIMALS[target].w, first: cr.first, extra: true });
      await animalSound(target);
      await respond(n, { word: ANIMALS[target].w });
      await rewardPaint();
    }
  }

  const WORDS = { dog: "🐕", cat: "🐈", hen: "🐔", egg: "🥚", milk: "🥛", apple: "🍎", ball: "⚽", shell: "🐚", wave: "🌊", crab: "🦀", fish: "🐟", boat: "⛵", sun: "☀️", banana: "🍌", bread: "🍞", water: "💧", cow: "🐄", tree: "🌳", duck: "🦆", flower: "🌸" };
  const THEMES = [["dog", "cat", "hen", "egg", "cow", "tree"], ["shell", "wave", "crab", "fish", "boat", "sun"], ["apple", "banana", "milk", "bread", "egg", "water"]];

  async function actWords() {
    const theme = THEMES[(session.lesson.n + session.lesson.week) % 3], used = [];
    for (let r = 0; r < 3; r++) {
      const target = shuffle(theme.filter((k) => !used.includes(k)))[0]; used.push(target);
      const opts = shuffle([target, ...pickN(theme.filter((k) => k !== target), 2)]);
      const n = h("div", "scene"); show(n);
      const prompt = () => say(askWhere(target), { rate: 0.7 });
      prompt().catch(() => {});
      const cr = await choiceRound(n, {
        skill: "words", options: opts.map((k) => ({ node: pic(k, WORDS[k]), say: () => say(k, { rate: 0.7 }) })),
        target: opts.indexOf(target), prompt, hintFirst: firstTime("words") && r === 0,
      });
      remember({ w: target, k: ANIMALS[target] ? "animal" : "thing", e: WORDS[target], q: target, first: cr.first, extra: true });
      await say(target + "!", { rate: 0.7 });
      await respond(n, { word: target });
      await rewardPaint();
    }
  }

  const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  function fly(it, basket) {
    const a = it.getBoundingClientRect(), b = basket.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    it.style.transition = "transform .55s cubic-bezier(.4,0,.2,1), opacity .55s";
    it.style.transform = "translate(" + dx + "px," + dy + "px) scale(.35)"; it.style.opacity = "0";
  }
  async function actCount() {
    const kinds = ["pebble", "egg", "shell"], greys = ["#9AA0A6", "#B7A99A", "#8C8F9A", "#C2B8A3"];
    for (let r = 0; r < 3; r++) {
      const kind = kinds[(session.lesson.n + r) % 3], N = countFor(r);
      const scene = h("div", "scene"), field = h("div", "field"), basket = h("div", "basket", '<span class="bn">0</span><span class="bi">🧺</span>');
      scene.append(field, basket); show(scene);
      const cells = pickN([...Array(15).keys()], N), items = [];
      cells.forEach((c) => {
        const it = h("button", "item", kind === "pebble"
          ? '<svg viewBox="0 0 60 50"><ellipse cx="30" cy="27" rx="26" ry="20" fill="' + greys[rnd(4)] + '" stroke="' + INK + '" stroke-width="3"/><ellipse cx="22" cy="20" rx="9" ry="5" fill="#fff" opacity=".35"/></svg>'
          : '<span class="emo">' + (kind === "egg" ? "🥚" : "🐚") + "</span>");
        it.style.left = ((c % 5) + 0.5) / 5 * 100 + (rnd(9) - 4) + "%"; it.style.top = (Math.floor(c / 5) + 0.5) / 3 * 100 + (rnd(11) - 5) + "%";
        it.setAttribute("aria-label", kind); field.append(it); items.push(it);
      });
      say({ pebble: "Pebbles!", egg: "Eggs!", shell: "Shells!" }[kind], { rate: 0.8 }).catch(() => {});
      await new Promise((res) => {
        let count = 0;
        items.forEach((it) => {
          it.onclick = () => {
            if (it.dataset.got) return; it.dataset.got = "1"; count++;
            fly(it, basket); basket.querySelector(".bn").textContent = count; sfx.tick();
            if (count < N) say(NUM[count], { rate: 0.8 }).catch(() => {}); else res();
          };
        });
        const me = cur;
        every(() => { if (me !== cur) return; const left = items.filter((i) => !i.dataset.got); if (left.length) left[0].classList.add("hint"); }, 9000);
      });
      track("count", true);
      if (r === 2) remember({ w: NUM[N] + " " + kind + "s", k: "number", e: { pebble: "🪨", egg: "🥚", shell: "🐚" }[kind], q: kind, vw: NUM[N], first: true, extra: true });
      await sleep(500); await say(NUM[N] + "!", { rate: 0.8 });
      await rewardPaint();
    }
  }

  async function actClimb() {
    for (let r = 0; r < 3; r++) {
      const N = countFor(r), pos = (i) => 3 + i * (80 / N);
      const wrap = h("div", "scene"), row = h("div", "climbwrap"), climb = h("div", "climb");
      climb.append(h("div", "rope"));
      const knots = [];
      for (let i = 1; i <= N; i++) { const k = h("div", "knot", "<span>" + i + "</span>"); k.style.bottom = pos(i) + "%"; climb.append(k); knots.push(k); }
      const bell = h("div", "bell", "🔔"), who = h("div", "climber", "🧗"); who.style.bottom = pos(0) + "%";
      climb.append(bell, who);
      const btn = h("button", "round up", ICON.up); btn.setAttribute("aria-label", "Climb");
      row.append(climb, btn); wrap.append(row); show(wrap);
      say("Up we go!", { rate: 0.8 }).catch(() => {});
      await new Promise((res) => {
        let L = 0;
        btn.onclick = () => {
          if (L >= N) return; L++; who.style.bottom = pos(L) + "%"; knots[L - 1].classList.add("got"); sfx.tick();
          if (L < N) say(NUM[L], { rate: 0.8 }).catch(() => {}); else { bell.classList.add("ring"); sfx.bell(); res(); }
        };
        const me = cur; every(() => { if (me === cur && L < N) btn.style.transform = "scale(1.08)", setTimeout(() => (btn.style.transform = ""), 400); }, 7000);
      });
      track("climb", true); await sleep(700); await say(NUM[N] + "!", { rate: 0.8 });
      await rewardPaint();
    }
  }

  const FACES = [{ k: "happy", e: "😊" }, { k: "sad", e: "😢" }, { k: "cross", e: "😠" }, { k: "sleepy", e: "😴" }];
  async function actFeelings() {
    const set = FACES.slice(0, cfg().faces), used = [];
    for (let r = 0; r < 3; r++) {
      const target = shuffle(set.filter((f) => !used.includes(f)))[0] || shuffle(set)[0]; used.push(target);
      const opts = shuffle([target, ...pickN(set.filter((f) => f !== target), 2)]);
      const n = h("div", "scene"); show(n);
      const prompt = () => say(askFace(target.k), { rate: 0.7 });
      prompt().catch(() => {});
      const cr = await choiceRound(n, {
        skill: "feelings", options: opts.map((f) => ({ node: '<span class="emo">' + f.e + "</span>", say: () => say(f.k, { rate: 0.7 }) })),
        target: opts.indexOf(target), prompt, hintFirst: firstTime("feelings") && r === 0,
      });
      remember({ w: target.k, k: "feeling", e: target.e, q: target.k, first: cr.first, extra: true });
      await say(target.k + "!", { rate: 0.7 });
      await respond(n, { word: target.k });
      await rewardPaint();
    }
  }

  /* Pip paints, then it is his turn. Waiting for the tap is the whole point: no timer, no pressure. */
  async function actTurns() {
    const set = COLORS.slice(0, 5);
    for (let r = 0; r < 3; r++) {
      const n = h("div", "scene"), who = h("div", "turnwho", "🐶"), pad = h("button", "turnpad"); pad.setAttribute("aria-label", "Paint pad");
      n.append(who, pad); show(n);
      await say("Pip’s turn", { rate: 0.75 }); await sleep(300);
      dab(pad, set[(r * 2) % 5].hex); sfx.splat(); await sleep(800);
      who.textContent = "🙋"; await say(settings.name + "’s turn", { rate: 0.75 });
      pad.classList.add("mine");
      await new Promise((res) => {
        pad.onclick = (e) => { if (!pad.classList.contains("mine")) return; pad.classList.remove("mine"); dab(pad, set[(r * 2 + 1) % 5].hex, e); sfx.splat(); res(); };
        const me = cur; every(() => { if (me === cur) say(settings.name + "’s turn", { rate: 0.75 }).catch(() => {}); }, 12000);
      });
      track("turns", true); await sleep(500); await rewardPaint();
    }
  }

  /* Asking by tapping a picture: either answer is right, and the word is spoken back. */
  const REQ = { more: { pic: ["🎨", "➕"], say: "More paint!", word: "more" }, help: { pic: ["🙋", "🤝"], say: "Help please!", word: "help" } };
  async function actRequest() {
    const plan = [["more", "Oh no! No more paint. Can you ask?"], ["help", "Oh no! The lid is stuck. Can you ask?"], ["more", "Pip wants more paint. Can you ask?"]];
    for (let r = 0; r < 3; r++) {
      const [want, line] = plan[r], n = h("div", "scene"), pip = h("div", "guide wave", "🐶"), row = h("div", "choices");
      const cards = shuffle(["more", "help"]).map((k) => {
        const b = h("button", "card pair", REQ[k].pic.map((e) => "<span>" + e + "</span>").join("")); b.dataset.any = "1"; b.dataset.k = k; return b;
      });
      row.append(...cards); n.append(pip, row); show(n);
      say(line, { rate: 0.75 }).catch(() => {});
      const k = await new Promise((res) => {
        cards.forEach((b) => { b.onclick = () => { clearTimers(); b.classList.add("win"); sfx.tick(); res(b.dataset.k); }; });
        const me = cur; every(() => { if (me !== cur) return; cards.find((b) => b.dataset.k === want).classList.add("hint"); say(line, { rate: 0.75 }).catch(() => {}); }, 9000);
      });
      track("request", true); remember({ w: REQ[k].word, k: "phrase", first: true });
      await say(REQ[k].say, { rate: 0.75 });
      await respond(n, { word: REQ[k].word });
      await rewardPaint();
    }
  }

  const STORIES = [
    { id: "beach", scenes: [
      { e: "🐶🏖️", t: "Pip goes to the beach." },
      { e: "🐚", t: "Pip sees something on the sand.", find: "shell", opts: ["shell", "crab", "boat"], q: "Can you find the shell?" },
      { e: "🌊", t: "Splash! The waves come in." },
      { e: "🦀", t: "Pip sees something with big claws.", find: "crab", opts: ["crab", "fish", "shell"], q: "Can you find the crab?" },
      { e: "🐶😴", t: "Pip is tired. Bye bye beach!" } ] },
    { id: "farm", scenes: [
      { e: "🐶🌅", t: "Good morning, Pip!" },
      { e: "🐔", t: "The hen has a surprise.", find: "egg", opts: ["egg", "apple", "ball"], q: "Can you find the egg?" },
      { e: "🐄", t: "The cow says moo." },
      { e: "🥛", t: "Pip is thirsty.", find: "milk", opts: ["milk", "water", "bread"], q: "Can you find the milk?" },
      { e: "🐶🌳", t: "Time to play. Bye bye farm!" } ] },
    { id: "walk", scenes: [
      { e: "🐶🌳", t: "Pip goes for a walk." },
      { e: "🌳", t: "Pip sees something very tall.", find: "tree", opts: ["tree", "ball", "sun"], q: "Can you find the tree?" },
      { e: "🌊", t: "Pip comes to the pond." },
      { e: "🦆", t: "Pip hears quack, quack.", find: "duck", opts: ["duck", "fish", "cat"], q: "Can you find the duck?" },
      { e: "🐶🏠", t: "Pip goes home. Bye bye pond!" } ] },
    { id: "paint", scenes: [
      { e: "🐶🎨", t: "Pip loves to paint." },
      { e: "☀️", t: "Pip paints something bright and warm.", find: "sun", opts: ["sun", "apple", "ball"], q: "Can you find the sun?" },
      { e: "🖌️", t: "Pip paints some more." },
      { e: "🌸", t: "Pip paints something that smells nice.", find: "flower", opts: ["flower", "tree", "dog"], q: "Can you find the flower?" },
      { e: "🐶😊", t: "What a lovely painting!" } ] },
  ];
  async function actStory() {
    const story = STORIES[session.lesson.week % STORIES.length];
    for (const sc of story.scenes) {
      const n = h("div", "scene"); n.append(h("div", "storypic", sc.e)); show(n);
      await say(sc.t, { rate: 0.75 });
      if (sc.find) {
        const rest = pickN(sc.opts.filter((k) => k !== sc.find), 2), opts = shuffle([sc.find, ...rest]);
        const prompt = () => say(sc.q, { rate: 0.75 });
        n.firstChild.classList.add("small"); await prompt().catch(() => {});
        const cr = await choiceRound(n, { skill: "story", options: opts.map((k) => ({ node: pic(k, WORDS[k]), say: () => say(k, { rate: 0.7 }) })), target: opts.indexOf(sc.find), prompt, hintFirst: false });
        remember({ w: sc.find, k: "thing", e: WORDS[sc.find], q: sc.find, first: cr.first, extra: true });
        await say(sc.find + "!", { rate: 0.7 });
        await rewardPaint();
      } else if (sc === story.scenes[story.scenes.length - 1]) {
        track("story", true); remember({ w: { beach: "the beach", farm: "the farm", walk: "a walk", paint: "painting" }[story.id], k: "story", e: { beach: "🏖️", farm: "🌾", walk: "🦆", paint: "🎨" }[story.id], first: true });
        await nextOnly(n); await rewardPaint();
      } else await nextOnly(n);
    }
  }
  function nextOnly(parent) {
    const me = cur;
    return new Promise((res) => {
      const bar = h("div", "respond"), next = h("button", "round next", ICON.arrow); next.setAttribute("aria-label", "Next");
      const fin = () => { clearTimeout(tm); if (me === cur) res(); };
      const tm = later(fin, 45000); next.onclick = fin; bar.append(next); parent.append(bar);
    });
  }

  const P2 = [
    { w: "go there", pic: ["🏃", "➡️", "🏠"] }, { w: "eat food", pic: ["😋", "🍽️"] }, { w: "more paint", pic: ["🎨", "➕"] },
    { w: "want ball", pic: ["🙋", "⚽"] }, { w: "go up", pic: ["🧗", "⬆️"] }, { w: "help me", pic: ["🙋", "🤝"] },
    { w: "see dog", pic: ["👀", "🐕"] }, { w: "open door", pic: ["🚪", "👐"] }, { w: "drink water", pic: ["🥤", "💧"] }, { w: "my turn", pic: ["👉", "🙋"] },
  ];
  const P3 = [
    { w: "I want ball", pic: ["🙋", "⚽"] }, { w: "I want paint", pic: ["🙋", "🎨"] }, { w: "I go up", pic: ["🧗", "⬆️"] },
    { w: "I eat food", pic: ["😋", "🍽️"] }, { w: "I see dog", pic: ["👀", "🐕"] }, { w: "go to beach", pic: ["🏃", "🏖️"] },
    { w: "I want water", pic: ["🙋", "💧"] }, { w: "help me please", pic: ["🙋", "🤝"] },
  ];
  async function actPhrases() {
    const list = phraseLen() === 3 ? P3 : P2;
    for (let r = 0; r < 3; r++) {
      const p = list[(prog.sessions * 3 + r) % list.length], ws = p.w.split(" ");
      const n = h("div", "scene"), pc = h("button", "pic", p.pic.map((e) => "<span>" + e + "</span>").join("")), chips = h("div", "chips", ws.map((w) => '<span class="chip">' + w + "</span>").join(""));
      pc.setAttribute("aria-label", p.w); n.append(pc, chips); show(n);
      const speak = async () => {
        const cs = [...chips.children];
        for (let i = 0; i < cs.length; i++) { cs.forEach((c) => c.classList.remove("on")); cs[i].classList.add("on"); await say(ws[i], { rate: 0.65 }); await sleep(250); }
        cs.forEach((c) => c.classList.remove("on")); chips.classList.add("all"); await say(p.w, { rate: 0.7 }); chips.classList.remove("all");
      };
      pc.onclick = () => { speak().catch(() => {}); };
      await speak();
      await respond(n, { word: p.w, idleMs: 45000 });
      track("phrases", true); remember({ w: p.w, k: "phrase", first: true });
      await rewardPaint();
    }
  }

  /* ---------- Phase 2: Month 2 activities ---------- */
  const CROW = '<svg viewBox="0 0 64 60"><ellipse cx="28" cy="34" rx="18" ry="13" fill="#2A2D4A"/><circle cx="44" cy="22" r="9" fill="#2A2D4A"/><path d="M52 21l10 3-10 4z" fill="#F6C445"/><path d="M12 36L1 46l14-4z" fill="#2A2D4A"/><circle cx="46.5" cy="20" r="2.2" fill="#fff"/><path d="M24 46v9M32 46v9" stroke="#8A5A44" stroke-width="3" stroke-linecap="round"/></svg>';
  const numCard = (v) => '<div class="numcard"><b>' + v + "</b><i>" + "●".repeat(Math.min(v, 10)) + "</i></div>";
  const crowWord = (n) => NUM[n] + (n === 1 ? " crow" : " crows");

  /* Picture story-maths: N crows sit, some fly away, how many are left? The answer is chosen from number cards with dots. */
  async function actCrows() {
    const maxN = cfg().crows || 5;
    for (let r = 0; r < 3; r++) {
      const total = Math.max(2, maxN - (2 - r)), gone = total >= 4 && r === 2 ? 2 : 1, left = total - gone;
      const n = h("div", "scene"), fence = h("div", "fence");
      const crows = [...Array(total)].map(() => h("div", "crow", CROW)); fence.append(...crows); n.append(fence); show(n);
      await say(crowWord(total) + " sit on the fence.", { rate: 0.75 });
      for (let i = 0; i < total; i++) { crows[i].classList.add("hop"); await say(NUM[i + 1], { rate: 0.8 }); }
      await say(gone === 1 ? "Oh! One crow flies away." : "Oh! Two crows fly away.", { rate: 0.75 });
      crows.slice(left).forEach((c) => c.classList.add("gone")); sfx.tick(); await sleep(900);
      const wrong = shuffle([...new Set([left + 1, left - 1, total].filter((x) => x >= 1 && x !== left))]).slice(0, 2);
      const opts = shuffle([left, ...wrong]);
      const prompt = () => say("How many crows are on the fence?", { rate: 0.75 });
      prompt().catch(() => {});
      const cr = await choiceRound(n, {
        skill: "crows", cls: "nums", options: opts.map((v) => ({ node: numCard(v), say: () => say(NUM[v], { rate: 0.7 }) })),
        target: opts.indexOf(left), prompt, hintFirst: firstTime("crows") && r === 0,
      });
      remember({ w: crowWord(left), k: "number", e: "🐦", vw: NUM[left], first: cr.first, extra: true });
      await say(crowWord(left) + "!", { rate: 0.75 });
      await respond(n, { word: NUM[left] });
      await rewardPaint();
    }
  }

  const YN_POOL = ["dog", "cat", "hen", "cow", "fish", "egg", "apple", "ball", "boat", "crab"];
  const an = (w) => (/^[aeiou]/.test(w) ? "an " : "a ") + w;
  async function actYesNo() {
    const answers = shuffle([true, false, Math.random() < 0.5]);
    for (let r = 0; r < 3; r++) {
      const yes = answers[r], thing = YN_POOL[rnd(YN_POOL.length)], label = yes ? thing : shuffle(YN_POOL.filter((k) => k !== thing))[0];
      const n = h("div", "scene"); n.append(h("div", "ynpic", pic(thing, WORDS[thing]))); show(n);
      const prompt = () => say("Is this " + an(label) + "?", { rate: 0.75 });
      prompt().catch(() => {});
      const opts = shuffle([{ k: "yes", e: "👍" }, { k: "no", e: "👎" }]);
      const cr = await choiceRound(n, {
        skill: "yesno", options: opts.map((o) => ({ node: '<span class="emo">' + o.e + "</span>", say: () => say(o.k, { rate: 0.7 }) })),
        target: opts.findIndex((o) => o.k === (yes ? "yes" : "no")), prompt, hintFirst: firstTime("yesno") && r === 0,
      });
      if (yes) remember({ w: thing, k: ANIMALS[thing] ? "animal" : "thing", e: WORDS[thing], q: thing, first: cr.first, extra: true });
      await say((yes ? "Yes" : "No") + "! This is " + an(thing) + ".", { rate: 0.75 });
      await respond(n, { word: yes ? "yes" : "no" });
      await rewardPaint();
    }
  }

  /* "First paint, then ball": tap the first picture, then the second unlocks. */
  const FT = [["paint", "🎨", "ball", "⚽"], ["wash hands", "🧼", "eat", "🍽️"], ["shoes", "👟", "go out", "🚪"], ["climb", "🧗", "drink", "🥤"], ["tidy up", "🧹", "story", "📖"]];
  async function actFirstThen() {
    for (let r = 0; r < 3; r++) {
      const [a, ae, b, be] = FT[(session.lesson.n + r) % FT.length];
      const n = h("div", "scene"), row = h("div", "ftrow");
      const f = h("button", "ftbox first hint", "<small>first</small><span>" + ae + "</span>"), t = h("button", "ftbox then locked", "<small>then</small><span>" + be + "</span>");
      f.setAttribute("aria-label", "First " + a); t.setAttribute("aria-label", "Then " + b);
      row.append(f, h("div", "ftarrow", "➜"), t); n.append(row); show(n);
      await say("First " + a + ", then " + b + ".", { rate: 0.75 });
      await new Promise((res) => {
        f.onclick = () => { if (f.classList.contains("done")) return; f.classList.add("done"); f.classList.remove("hint"); t.classList.remove("locked"); t.classList.add("hint"); sfx.tick(); say("First " + a + "!", { rate: 0.75 }).catch(() => {}); };
        t.onclick = () => { if (t.classList.contains("locked") || t.classList.contains("done")) return; t.classList.add("done"); t.classList.remove("hint"); sfx.tick(); res(); };
      });
      track("firstthen", true);
      await say("Then " + b + "!", { rate: 0.75 });
      await rewardPaint();
    }
  }

  /* Social routines: hi, thank you, bye bye. Tapping is the wave; saying it back is optional. */
  async function actGreet() {
    const S = [
      { pip: "🐶", big: "👋", line: "Pip says hi! Can you wave hi?", reply: "Hi!", word: "hi" },
      { pip: "🐶🎁", big: "🙏", line: "Pip has a present for you. Can you say thank you?", reply: "Thank you!", word: "thank you" },
      { pip: "🐶🌙", big: "👋", line: "Time to go. Can you wave bye bye?", reply: "Bye bye!", word: "bye bye" },
    ];
    for (const s of S) {
      const n = h("div", "scene"), b = h("button", "greetbtn", s.big); b.setAttribute("aria-label", s.word);
      n.append(h("div", "storypic small", s.pip), b); show(n);
      say(s.line, { rate: 0.75 }).catch(() => {});
      await new Promise((res) => {
        b.onclick = () => { clearTimers(); b.classList.add("waving"); sfx.tick(); res(); };
        const me = cur; every(() => { if (me === cur) say(s.line, { rate: 0.75 }).catch(() => {}); }, 12000);
      });
      track("greet", true);
      await say(s.reply, { rate: 0.75 });
      await respond(n, { word: s.word });
      await rewardPaint();
    }
  }

  /* Two-word requests built by tapping two pictures: "more" + "paint". Any choice is fine; the phrase is spoken back. */
  const ASK_A = [{ k: "more", e: "➕" }, { k: "want", e: "🙋" }];
  const ASK_B = [{ k: "paint", e: "🎨" }, { k: "ball", e: "⚽" }, { k: "water", e: "💧" }, { k: "food", e: "🍽️" }];
  async function actAsk2() {
    for (let r = 0; r < 3; r++) {
      const n = h("div", "scene"), slots = h("div", "slots"), row = h("div", "choices");
      const s1 = h("span", "slot", "?"), s2 = h("span", "slot", "?"); slots.append(s1, s2);
      n.append(h("div", "guide wave small", "🐶"), slots, row); show(n);
      const pick = (items, slot, line) => new Promise((res) => {
        row.replaceChildren(); say(line, { rate: 0.75 }).catch(() => {});
        const cards = items.map((it) => {
          const b = h("button", "card pair", "<span>" + it.e + "</span>"); b.dataset.any = "1"; b.setAttribute("aria-label", it.k);
          b.onclick = () => { clearTimers(); b.classList.add("win"); sfx.tick(); slot.textContent = it.k; slot.classList.add("on"); res(it); }; return b;
        });
        row.append(...cards); const me = cur; every(() => { if (me === cur) cards[0].classList.add("hint"); }, 9000);
      });
      const a = await pick(shuffle(ASK_A), s1, "Tell Pip with two words. Pick the first word.");
      const b = await pick(pickN(ASK_B, 2), s2, a.k + "… what?");
      row.remove(); slots.classList.add("all"); track("ask2", true); remember({ w: a.k + " " + b.k, k: "phrase", first: true });
      await say(a.k + " " + b.k + "!", { rate: 0.7 });
      await respond(n, { word: a.k + " " + b.k, idleMs: 45000 });
      await rewardPaint();
    }
  }

  /* How does Pip feel? A tiny story, then the matching face. */
  const FEEL_SCENES = [
    { e: "🎂", t: "It is Pip’s birthday!", face: "happy" }, { e: "🎁", t: "Pip got a present!", face: "happy" },
    { e: "🍦", t: "Pip dropped his ice cream.", face: "sad" }, { e: "🌧️", t: "It is raining and Pip cannot go out.", face: "sad" },
    { e: "⚽", t: "Someone took Pip’s ball.", face: "cross" }, { e: "🌙", t: "It is late and Pip is very tired.", face: "sleepy" },
  ];
  async function actFeelStory() {
    const faces = FACES.slice(0, cfg().faces), ok = FEEL_SCENES.filter((s) => faces.some((f) => f.k === s.face)), used = [];
    for (let r = 0; r < 3; r++) {
      const sc = shuffle(ok.filter((s) => !used.includes(s)))[0] || shuffle(ok)[0]; used.push(sc);
      const target = faces.find((f) => f.k === sc.face), opts = shuffle([target, ...pickN(faces.filter((f) => f !== target), 2)]);
      const n = h("div", "scene"); n.append(h("div", "storypic small", sc.e)); show(n);
      await say(sc.t, { rate: 0.75 });
      const prompt = () => say("How does Pip feel?", { rate: 0.75 });
      prompt().catch(() => {});
      const cr = await choiceRound(n, {
        skill: "feelstory", options: opts.map((f) => ({ node: '<span class="emo">' + f.e + "</span>", say: () => say(f.k, { rate: 0.7 }) })),
        target: opts.indexOf(target), prompt, hintFirst: firstTime("feelstory") && r === 0,
      });
      remember({ w: target.k, k: "feeling", e: target.e, q: target.k, first: cr.first, extra: false });
      await say(target.k + "!", { rate: 0.7 });
      await respond(n, { word: target.k });
      await rewardPaint();
    }
  }

  const ACT = { colour: actColour, splash: actSplash, sound: actSound, words: actWords, count: actCount, climb: actClimb, feelings: actFeelings, turns: actTurns, request: actRequest, story: actStory,
    yesno: actYesNo, crows: actCrows, firstthen: actFirstThen, greet: actGreet, request2: actAsk2, feelstory: actFeelStory };
  const FAVS = ["colour", "sound", "words", "count", "climb", "feelings", "turns"];
  /* A favourite is the activity he has practised most (a little randomness breaks ties), never one already in today's lesson. */
  function pickFav(avoid) {
    const c = FAVS.filter((a) => !avoid.includes(a)).map((a) => ({ a, s: ((prog.stats[a] || {}).r || 0) + Math.random() })).sort((x, y) => y.s - x.s);
    return c[0].a;
  }

  /* ---------- session ---------- */
  async function stepHello() {
    const n = h("div", "scene"), g = h("button", "guide wave", "🐶"); g.setAttribute("aria-label", "Pip the dog");
    n.append(g); show(n); sfx.tick();
    g.onclick = () => { say("Hello!", { rate: 0.75 }).catch(() => {}); };
    await say("Hello!", { rate: 0.75 });
    await respond(n, { word: "hello", idleMs: 45000 });
    await rewardPaint();
  }
  async function finale() {
    const L = session.lesson;
    const n = h("div", "scene finale done"), art = h("div", "bigart", paintingSVG(fills, -1, session.extras)), row = h("div", "row");
    const g = h("button", "round", ICON.gallery), t = h("button", "round together", "🤝"), d = h("button", "round next", ICON.home);
    g.setAttribute("aria-label", "Paintings"); t.setAttribute("aria-label", "Together moment"); d.setAttribute("aria-label", "Finish");
    g.onclick = gallery; t.onclick = togetherScreen; d.onclick = goHome; row.append(g, t, d); n.append(art, row); show(n);
    thumb.hidden = true; homeBtn.hidden = true;
    const day = today();
    prog.sessions++; if (!prog.days.includes(day)) prog.days.push(day);
    if (!session.bonus) prog.lessons.push({ n: L.n, day, ts: Date.now() });
    const words = pickMemory(), vm = words.find((m) => session.recs[m.vw]), anyRec = Object.keys(session.recs)[0];
    const voice = vm ? { id: session.recs[vm.vw], w: vm.vw } : anyRec ? { id: session.recs[anyRec], w: anyRec } : null;
    prog.gallery.push({ ts: Date.now(), fills: fills.slice(), lesson: L.n, month: L.month, week: L.week, title: L.title, words, extras: session.extras.slice(), voice, rc: 0 });
    if (prog.gallery.length > 300) prog.gallery.shift();
    adaptAfterSession(); saveProg(); sfx.fanfare(); confetti();
    await say("Well done, " + settings.name + "!", { rate: 0.8 });
    if (L.showoff) { g.classList.add("pulse"); await say("Look at your paintings!", { rate: 0.8 }); }
  }
  /* The grown-up part of every lesson, shown after the painting. */
  function togetherScreen() {
    cur++; thumb.hidden = true; homeBtn.hidden = true;
    const L = session.lesson, n = h("div", "scene tg");
    n.innerHTML = '<div class="tgico">🤝</div><div class="tgbox"><b>Together moment</b><p></p><small>Grown-up: press and hold the tick when you have done it.</small></div><div class="row2"><button class="round next" id="tgYes" aria-label="We did it (press and hold)">✓</button><button class="round" id="tgHome" aria-label="Home"></button></div>';
    $("p", n).textContent = L.together; $("#tgHome", n).innerHTML = ICON.home; $("#tgHome", n).onclick = goHome;
    holdButton($("#tgYes", n), 700, () => {
      if ($("#tgYes", n).classList.contains("saved")) return;
      prog.together.push({ n: L.n, week: L.week, ts: Date.now(), day: today() }); saveProg();
      $("#tgYes", n).classList.add("saved"); sfx.chime();
    });
    show(n);
  }
  /* "Remember this one?" A painting from a few days ago comes back, and one easy question about a word on it:
     practising recall a few days later helps learning stick. No reward and no pressure; it is a warm-up. */
  function recallCandidate() {
    const cutoff = Date.now() - 2 * 864e5;
    const cands = prog.gallery.filter((g) => g.ts <= cutoff && g.words && g.words.some((w) => w.e && w.q));
    if (!cands.length) return null;
    cands.sort((a, b) => (a.rc || 0) - (b.rc || 0) || a.ts - b.ts);
    const g = cands[0], ws = g.words.filter((w) => w.e && w.q);
    return { g, m: ws[rnd(ws.length)] };
  }
  async function stepRecall() {
    const pick = recallCandidate(); if (!pick) return;
    const { g, m } = pick;
    const pool = m.k === "colour" ? COLORS.map((c) => ({ e: c.hex, w: c.n })) : m.k === "feeling" ? FACES.map((f) => ({ e: f.e, w: f.k })) : Object.entries(WORDS).map(([w, e]) => ({ w, e }));
    const opts = shuffle([{ e: m.e, w: m.q }, ...pickN(pool.filter((p) => p.w !== m.q && p.e !== m.e), 2)]);
    const isCol = m.e.charAt(0) === "#", node = (o) => (o.e.charAt(0) === "#" ? potSVG(o.e) : pic(o.w, o.e));
    const n = h("div", "scene"); n.append(h("div", "recallart", paintingSVG(g.fills, -1, g.extras)));
    thumb.hidden = true; show(n);
    await say("Remember this one?", { rate: 0.75 });
    const line = m.k === "colour" ? "Can you find " + m.q + "?" : m.k === "feeling" ? "Can you find the " + m.q + " face?" : "Can you find the " + m.q + "?";
    const prompt = () => say(line, { rate: 0.75 });
    prompt().catch(() => {});
    const cr = await choiceRound(n, { skill: "recall", cls: isCol ? "pots" : "", options: opts.map((o) => ({ node: node(o), say: () => say(o.w, { rate: 0.7 }) })), target: opts.findIndex((o) => o.w === m.q), prompt, hintFirst: false });
    g.rc = (g.rc || 0) + 1; saveProg(); sfx.chime();
    await say("Yes! " + m.q + "!", { rate: 0.75 });
    thumb.hidden = false; thumb.innerHTML = paintingSVG(fills, -1, session.extras);
  }
  async function runSession() {
    const me = ++cur; fills = Array(REGIONS.length).fill(null);
    const pl = planNow(); session = { lesson: pl.lesson, bonus: pl.bonus, mem: [], extras: [], recs: {} };
    thumb.hidden = false; thumb.innerHTML = paintingSVG(fills, -1, session.extras); homeBtn.hidden = false;
    try {
      await stepHello();
      if (!session.bonus) await stepRecall();
      const planned = C.actsFor(session.lesson), used = planned.filter((a) => a !== "fav");
      for (const id of planned) { const a = id === "fav" ? pickFav(used) : id; used.push(a); await ACT[a](); }
      await actPhrases(); await finale();
    } catch (e) { if (!(e instanceof Cancel)) { console.error(e); if (me === cur) goHome(); } }
  }

  /* ---------- home, gallery ---------- */
  function goHome() {
    cur++; thumb.hidden = true; homeBtn.hidden = true;
    const n = h("div", "home"), pl = planNow();
    n.innerHTML = '<div class="title"></div><div class="hero"><button class="guide big" aria-label="Pip the dog">🐶</button><button class="play" aria-label="Start painting">' + ICON.brush + '<span class="tbadge"></span></button></div><div class="row"><button class="round" aria-label="Paintings">' + ICON.gallery + '</button><div class="gwrap"><span class="gtip">grown-ups<br>press and hold</span><button class="dot" aria-label="Grown-ups (press and hold)"></button></div></div>';
    $(".title", n).textContent = settings.name + "’s Farm Studio";
    $(".tbadge", n).textContent = pl.lesson.icon;
    $(".guide", n).onclick = () => { audio(); say("Hello!", { rate: 0.75 }).catch(() => {}); };
    $(".play", n).onclick = () => { audio(); if (hasTTS) try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { /* ignore */ } runSession(); };
    $(".row .round", n).onclick = gallery;
    holdButton($(".dot", n), 1500, () => { if (window.OFS && window.OFS.openParent) window.OFS.openParent(); });
    show(n);
  }
  /* ---------- gallery: every painting remembers a few words ---------- */
  const listWords = (ws) => (ws.length <= 1 ? ws[0] || "" : ws.slice(0, -1).join(", ") + " and " + ws[ws.length - 1]);
  const recapText = (g) => (g.words && g.words.length ? "Remember this day? " + listWords(g.words.map((w) => w.w)) + "." : "This was " + (g.title || "a painting day") + ".");
  const promptText = (g) => (g.words && g.words.length
    ? "Look together and ask: “What did we paint here?” " + (g.words.find((w) => w.q) ? "Then point to the " + g.words.find((w) => w.q).q + " and wait for any answer." : "Then say “" + g.words[0].w + "” together and wait for any answer.") + " Words on this painting: " + listWords(g.words.map((w) => w.w)) + "."
    : "Look together and ask: “What did we do on this day?” Any answer, point or sound is welcome.");
  const sticker = (w) => (w.e ? (w.e.charAt(0) === "#" ? '<i class="dotc" style="background:' + w.e + '"></i>' : "<span>" + w.e + "</span>") : "");
  const media = {
    shrink(file) {
      return new Promise((res) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
          const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
          c.toBlob((b) => res(b || file), "image/jpeg", 0.82);
        };
        img.onerror = () => { URL.revokeObjectURL(url); res(file); };
        img.src = url;
      });
    },
    async put(file) { const blob = await this.shrink(file); return idb.tx("readwrite", (st) => st.add({ blob, ts: Date.now() }), "media"); },
    get(id) { return idb.tx("readonly", (st) => st.get(id), "media").then((r) => r && r.blob); },
  };

  /* Tap a painting: Pip reminds him of the words, with a tap-to-hear for each. Grown-ups (press and hold) get a prompt and can add a real photo. */
  function openPainting(g, host, onChange) {
    const o = h("div", "overlay pnt"), box = h("div", "pbox"), side = h("div", "pside");
    const art = h("div", "bigart", paintingSVG(g.fills, -1, g.extras));
    const close = h("button", "round pclose", "✕"); close.setAttribute("aria-label", "Close");
    const chips = h("div", "wchips"), ctr = h("div", "pctr");
    (g.words || []).forEach((w) => { const b = h("button", "wchip", sticker(w) + "<b></b>"); $("b", b).textContent = w.w; b.onclick = () => { say(w.w, { rate: 0.7 }).catch(() => {}); }; chips.append(b); });
    const hear = h("button", "round hear", ICON.speaker); hear.setAttribute("aria-label", "Hear it again");
    const hearAll = () => say(recapText(g), { rate: 0.75 }).catch(() => {});
    hear.onclick = hearAll; ctr.append(hear);
    if (g.voice) {
      const mv = h("button", "round myvoice", "🎙️"); mv.setAttribute("aria-label", "Hear my own voice");
      mv.onclick = async () => { try { const r = await idb.tx("readonly", (st) => st.get(g.voice.id)); if (r && r.blob) await playBoosted(r.blob); else mv.remove(); } catch (e) { mv.remove(); } };
      ctr.append(mv);
    }
    const photo = h("div", "polaroid"); photo.hidden = true;
    const showPhoto = async () => {
      if (!g.photo) { photo.hidden = true; return; }
      try { const b = await media.get(g.photo); if (b) { photo.innerHTML = '<img alt="A real photo from home">'; $("img", photo).src = URL.createObjectURL(b); photo.hidden = false; } else photo.hidden = true; } catch (e) { photo.hidden = true; }
    };
    showPhoto();
    const gb = h("button", "gbtn", "grown-ups"), panel = h("div", "gpanel"); panel.hidden = true;
    panel.innerHTML = '<p></p><label>Add a real photo (his own dog, the farm…) <input type="file" accept="image/*"></label><button class="gbtn2" type="button">Remove photo</button>';
    $("p", panel).textContent = promptText(g);
    holdButton(gb, 900, () => { panel.hidden = !panel.hidden; });
    $("input", panel).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { g.photo = await media.put(f); saveProg(); showPhoto(); onChange && onChange(); } catch (er) { /* ignore */ } };
    $(".gbtn2", panel).onclick = () => { g.photo = null; saveProg(); showPhoto(); onChange && onChange(); };
    o.onclick = (e) => { if (e.target === o) o.remove(); }; close.onclick = () => o.remove();
    side.append(chips, ctr); box.append(art, side, photo); o.append(box, close, gb, panel); host.append(o);
    hearAll();
  }
  function gallery() {
    cur++; thumb.hidden = true; homeBtn.hidden = true;
    const n = h("div", "gallery"), grid = h("div", "grid"), back = h("button", "round next", ICON.home);
    back.setAttribute("aria-label", "Home"); back.onclick = goHome;
    prog.gallery.slice().reverse().forEach((g) => {
      const wrap = h("div", "tilewrap"), t = h("button", "tile", paintingSVG(g.fills, -1, g.extras));
      t.setAttribute("aria-label", "Painting " + new Date(g.ts).toDateString() + (g.words && g.words.length ? ": " + g.words.map((w) => w.w).join(", ") : ""));
      const capHtml = () => (g.words || []).map(sticker).join("") + (g.photo ? "<span>📷</span>" : ""), cap = h("div", "cap", capHtml());
      t.onclick = () => openPainting(g, n, () => { cap.innerHTML = capHtml(); });
      wrap.append(t, cap);
      grid.append(wrap);
    });
    if (!prog.gallery.length) grid.append(h("p", "empty", "Paintings will show up here"));
    n.append(back, grid); show(n);
  }

  holdButton(homeBtn, 900, goHome);
  window.OFS = { h, $, show, store, prog, settings, saveProg, saveSettings, idb, playBoosted, say, hasTTS, goHome, today, planNow, paintingSVG, getPhoto: media.get, promptText,
    enter() { cur++; thumb.hidden = true; homeBtn.hidden = true; } };
  window.__ozzy = { goHome, runSession, prog, settings };
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("/sw.js").catch(() => {});
  goHome();
})();
