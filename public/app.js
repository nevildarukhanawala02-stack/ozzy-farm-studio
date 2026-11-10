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
  const settings = Object.assign({ name: "Ozzy", phraseLen: 2, rate: 0.8, voice: "", sfx: true }, store.get("settings", {}));
  const prog = Object.assign({ sessions: 0, days: [], attempts: 0, gallery: [] }, store.get("prog", {}));
  const saveSettings = () => store.set("settings", settings);
  const saveProg = () => store.set("prog", prog);

  const idb = {
    db: null,
    open() {
      if (!this.db) {
        this.db = new Promise((res, rej) => {
          if (!window.indexedDB) return rej(new Error("no idb"));
          const r = indexedDB.open("ozzy", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("recs", { keyPath: "id", autoIncrement: true });
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      }
      return this.db;
    },
    async tx(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction("recs", mode); const s = t.objectStore("recs"); const req = fn(s);
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
  async function saveRec(word, blob) { try { await idb.add({ word, ts: Date.now(), blob, type: blob.type }); } catch (e) { /* ignore */ } }

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
  function paintingSVG(fills, newIdx) {
    const parts = REGIONS.map((r, i) => '<g class="rg' + (i === newIdx ? " new" : "") + '" fill="' + (fills[i] || "#fff") + '" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round">' + r.s + "</g>").join("");
    return '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Painting">' + parts + "</svg>";
  }

  /* ---------- screen plumbing ---------- */
  const stage = $("#stage"), thumb = $("#thumb"), homeBtn = $("#homeBtn");
  homeBtn.innerHTML = ICON.home;
  let fills = Array(REGIONS.length).fill(null);
  const zoom = () => {
    if ($("#app > .overlay")) return;
    const o = h("div", "overlay", '<div class="bigart">' + paintingSVG(fills) + "</div>");
    o.onclick = () => o.remove(); $("#app").append(o);
  };
  thumb.setAttribute("role", "button"); thumb.tabIndex = 0; thumb.setAttribute("aria-label", "Zoom in on the painting");
  thumb.onclick = zoom; thumb.onkeydown = (e) => { if (e.key === "Enter") zoom(); };

  function show(node) { document.querySelectorAll("#app > .overlay").forEach((o) => o.remove()); clearTimers(); stopSpeech(); stage.replaceChildren(node); node.classList.add("enter"); }
  function paintNext(color) {
    const i = fills.findIndex((f) => !f); if (i < 0) return;
    fills[i] = color || REGIONS[i].c;
    thumb.innerHTML = paintingSVG(fills, i);
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
        if (blob && blob.size > 0) { saveRec(word, blob); await playBoosted(blob); }
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
      const arm = () => { clearTimeout(tm); tm = later(fin, opt.idleMs || 12000); };
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
          if (i === o.target) { done = true; clearTimers(); b.classList.add("win"); sfx.tick(); resolve(i); return; }
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

  /* ---------- activities ---------- */
  const COLORS = [
    { n: "red", hex: "#E23D3D" }, { n: "blue", hex: "#2F6FDE" }, { n: "yellow", hex: "#F6C21B" }, { n: "green", hex: "#3BA55D" },
    { n: "orange", hex: "#F28A1E" }, { n: "pink", hex: "#F06FA8" }, { n: "purple", hex: "#8A4FD0" },
  ];
  const potSVG = (hex) => '<svg viewBox="0 0 100 100"><path d="M14 32V78Q14 93 50 93T86 78V32Z" fill="' + hex + '" stroke="' + INK + '" stroke-width="4"/><ellipse cx="50" cy="32" rx="36" ry="11" fill="' + hex + '" stroke="' + INK + '" stroke-width="4"/><ellipse cx="50" cy="32" rx="36" ry="11" fill="#fff" opacity=".4"/><path d="M32 22Q50 4 68 22" fill="none" stroke="' + INK + '" stroke-width="4"/></svg>';
  const BLOB = "M100 18C130 10 168 30 178 62C192 98 170 140 138 160C108 182 64 176 40 150C14 122 18 78 42 52C58 32 78 22 100 18Z";

  async function actColour() {
    const set = COLORS.slice(0, prog.sessions < 3 ? 3 : prog.sessions < 6 ? 5 : 7), used = [];
    for (let r = 0; r < 3; r++) {
      const target = shuffle(set.filter((c) => !used.includes(c)))[0] || set[0]; used.push(target);
      const opts = shuffle([target, ...pickN(set.filter((c) => c !== target), 2)]);
      const n = h("div", "scene"), board = h("div", "board"); n.append(board); show(n);
      const prompt = () => say(target.n, { rate: 0.7 });
      prompt().catch(() => {});
      await choiceRound(n, {
        cls: "pots", options: opts.map((c) => ({ node: potSVG(c.hex), say: () => say(c.n, { rate: 0.7 }) })),
        target: opts.indexOf(target), prompt, hintFirst: prog.sessions < 2 && r === 0,
      });
      board.innerHTML = '<svg class="splat" viewBox="0 0 200 200"><path d="' + BLOB + '" fill="' + target.hex + '"/></svg><div class="bword">' + target.n + "</div>";
      sfx.splat(); await say(target.n + "!", { rate: 0.75 });
      await respond(n, { word: target.n });
      await rewardPaint(target.hex);
    }
  }

  const ANIMALS = {
    dog: { e: "🐕", s: "Woof woof!", p: 0.8, w: "woof" }, cat: { e: "🐈", s: "Meow!", p: 1.6, w: "meow" },
    hen: { e: "🐔", s: "Cluck cluck!", p: 1.5, w: "cluck" }, hamster: { e: "🐹", s: "Squeak squeak!", p: 2, w: "squeak" },
    cow: { e: "🐄", s: "Moo!", p: 0.4, w: "moo" }, sheep: { e: "🐑", s: "Baa!", p: 1.2, w: "baa" },
  };
  const animalSound = (k) => { const f = assetFile("sounds", k); return f ? playFile(f) : say(ANIMALS[k].s, { pitch: ANIMALS[k].p, rate: 0.85 }); };

  async function actSound() {
    const keys = Object.keys(ANIMALS).slice(0, prog.sessions < 3 ? 3 : prog.sessions < 6 ? 4 : 6), used = [];
    for (let r = 0; r < 3; r++) {
      const target = shuffle(keys.filter((k) => !used.includes(k)))[0] || keys[0]; used.push(target);
      const opts = shuffle([target, ...pickN(keys.filter((k) => k !== target), 2)]);
      const n = h("div", "scene"); show(n);
      const prompt = () => animalSound(target);
      prompt().catch(() => {});
      await choiceRound(n, {
        options: opts.map((k) => ({ node: pic(k, ANIMALS[k].e), say: () => animalSound(k) })),
        target: opts.indexOf(target), prompt, hintFirst: prog.sessions < 2 && r === 0,
      });
      await animalSound(target);
      await respond(n, { word: ANIMALS[target].w });
      await rewardPaint();
    }
  }

  const WORDS = { dog: "🐕", cat: "🐈", hen: "🐔", egg: "🥚", milk: "🥛", apple: "🍎", ball: "⚽", shell: "🐚", wave: "🌊", crab: "🦀", fish: "🐟", boat: "⛵", sun: "☀️", banana: "🍌", bread: "🍞", water: "💧", cow: "🐄", tree: "🌳" };
  const THEMES = [["dog", "cat", "hen", "egg", "cow", "tree"], ["shell", "wave", "crab", "fish", "boat", "sun"], ["apple", "banana", "milk", "bread", "egg", "water"]];

  async function actWords() {
    const theme = THEMES[prog.sessions % 3], used = [];
    for (let r = 0; r < 3; r++) {
      const target = shuffle(theme.filter((k) => !used.includes(k)))[0]; used.push(target);
      const opts = shuffle([target, ...pickN(theme.filter((k) => k !== target), 2)]);
      const n = h("div", "scene"); show(n);
      const prompt = () => say(target, { rate: 0.7 });
      prompt().catch(() => {});
      await choiceRound(n, {
        options: opts.map((k) => ({ node: pic(k, WORDS[k]), say: () => say(k, { rate: 0.7 }) })),
        target: opts.indexOf(target), prompt, hintFirst: prog.sessions < 2 && r === 0,
      });
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
      const kind = kinds[(prog.sessions + r) % 3], N = Math.min(10, 2 + Math.floor(prog.sessions / 2) + r);
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
      await sleep(500); await say(NUM[N] + "!", { rate: 0.8 });
      await rewardPaint();
    }
  }

  async function actClimb() {
    for (let r = 0; r < 3; r++) {
      const N = Math.min(10, 3 + Math.floor(prog.sessions / 2) + r), pos = (i) => 3 + i * (80 / N);
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
      await sleep(700); await say(NUM[N] + "!", { rate: 0.8 });
      await rewardPaint();
    }
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
    const list = settings.phraseLen === 3 ? P3 : P2;
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
      await respond(n, { word: p.w, idleMs: 20000 });
      await rewardPaint();
    }
  }

  /* ---------- session ---------- */
  async function stepHello() {
    const n = h("div", "scene"), g = h("button", "guide wave", "🐶"); g.setAttribute("aria-label", "Pip the dog");
    n.append(g); show(n); sfx.tick();
    g.onclick = () => { say("Hello!", { rate: 0.75 }).catch(() => {}); };
    await say("Hello!", { rate: 0.75 });
    await respond(n, { word: "hello", idleMs: 14000 });
    await rewardPaint();
  }
  async function finale() {
    const n = h("div", "scene finale done"), art = h("div", "bigart", paintingSVG(fills)), row = h("div", "row");
    const g = h("button", "round", ICON.gallery), d = h("button", "round next", ICON.home);
    g.setAttribute("aria-label", "Paintings"); d.setAttribute("aria-label", "Finish");
    g.onclick = gallery; d.onclick = goHome; row.append(g, d); n.append(art, row); show(n);
    thumb.hidden = true; homeBtn.hidden = true;
    const day = new Date().toISOString().slice(0, 10);
    prog.sessions++; if (!prog.days.includes(day)) prog.days.push(day);
    prog.gallery.push({ ts: Date.now(), fills: fills.slice() }); if (prog.gallery.length > 60) prog.gallery.shift();
    saveProg(); sfx.fanfare(); confetti();
    await say("Well done, " + settings.name + "!", { rate: 0.8 });
  }
  const ACTS = [actColour, actSound, actWords, actCount, actClimb];
  async function runSession() {
    const me = ++cur; fills = Array(REGIONS.length).fill(null);
    thumb.hidden = false; thumb.innerHTML = paintingSVG(fills); homeBtn.hidden = false;
    try {
      await stepHello();
      const s = prog.sessions;
      await ACTS[(2 * s) % 5](); await ACTS[(2 * s + 1) % 5]();
      await actPhrases(); await finale();
    } catch (e) { if (!(e instanceof Cancel)) { console.error(e); if (me === cur) goHome(); } }
  }

  /* ---------- home, gallery, grown-ups ---------- */
  function goHome() {
    cur++; thumb.hidden = true; homeBtn.hidden = true;
    const n = h("div", "home");
    n.innerHTML = '<div class="title"></div><div class="hero"><button class="guide big" aria-label="Pip the dog">🐶</button><button class="play" aria-label="Start painting">' + ICON.brush + '</button></div><div class="row"><button class="round" aria-label="Paintings">' + ICON.gallery + '</button><button class="dot" aria-label="Grown-ups (press and hold)"></button></div>';
    $(".title", n).textContent = settings.name + "’s Farm Studio";
    $(".guide", n).onclick = () => { audio(); say("Hello!", { rate: 0.75 }).catch(() => {}); };
    $(".play", n).onclick = () => { audio(); if (hasTTS) try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { /* ignore */ } runSession(); };
    $(".row .round", n).onclick = gallery;
    holdButton($(".dot", n), 1500, parentArea);
    show(n);
  }
  function gallery() {
    cur++; thumb.hidden = true; homeBtn.hidden = true;
    const n = h("div", "gallery"), grid = h("div", "grid"), back = h("button", "round next", ICON.home);
    back.setAttribute("aria-label", "Home"); back.onclick = goHome;
    prog.gallery.slice().reverse().forEach((g) => {
      const t = h("button", "tile", paintingSVG(g.fills)); t.setAttribute("aria-label", "Painting " + new Date(g.ts).toDateString());
      t.onclick = () => { const o = h("div", "overlay", '<div class="bigart">' + paintingSVG(g.fills) + "</div>"); o.onclick = () => o.remove(); n.append(o); };
      grid.append(t);
    });
    if (!prog.gallery.length) grid.append(h("p", "empty", "Paintings will show up here"));
    n.append(back, grid); show(n);
  }
  async function parentArea() {
    cur++; thumb.hidden = true; homeBtn.hidden = true;
    const n = h("div", "parent");
    const last = prog.days.length ? prog.days[prog.days.length - 1] : "not yet";
    n.innerHTML =
      "<h1>For grown-ups</h1>" +
      '<div class="box"><b>' + prog.sessions + "</b> sessions finished on <b>" + prog.days.length + "</b> days (last: " + last + "). Voice attempts: <b>" + prog.attempts + "</b>. Silent or very quiet attempts count too.</div>" +
      '<h2>Settings</h2><div class="box">' +
      '<label>Child’s name <input type="text" id="pName" maxlength="20"></label>' +
      '<label>Phrase length <select id="pLen"><option value="2">2 words (go there, eat food)</option><option value="3">3 words (I want ball)</option></select></label>' +
      '<label>Voice <select id="pVoice"></select></label>' +
      '<label>Speaking speed <input type="range" id="pRate" min="0.5" max="1.1" step="0.05"></label>' +
      '<label><input type="checkbox" id="pSfx"> Play soft sound effects</label>' +
      '<button class="btn grey" id="pTest">Hear a test</button></div>' +
      '<h2>Recorded attempts</h2><div class="box" id="pRecs">Loading…</div>' +
      '<h2>Make it personal</h2><p>Put photos of your own animals in <code>public/photos</code> (named dog.jpg, cat.jpg, hen.jpg, hamster.jpg, cow.jpg, sheep.jpg) and recordings in <code>public/sounds</code> (dog.mp3, cat.mp3, hen.mp3…). The app picks them up automatically after you redeploy.</p>' +
      '<p><small>Everything is saved only on this device, and nothing is uploaded. Recordings stay in this browser.</small></p>' +
      '<button class="btn" id="pDone">Back</button> <button class="btn red" id="pReset">Erase all progress and recordings</button>';
    show(n);
    const name = $("#pName", n), len = $("#pLen", n), voice = $("#pVoice", n), rate = $("#pRate", n), sfxBox = $("#pSfx", n);
    name.value = settings.name; len.value = String(settings.phraseLen); rate.value = settings.rate; sfxBox.checked = settings.sfx;
    const fillVoices = () => {
      const vs = hasTTS ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
      voice.innerHTML = '<option value="">Automatic</option>' + vs.map((v) => '<option value="' + v.voiceURI + '">' + v.name + " (" + v.lang + ")</option>").join("");
      voice.value = settings.voice;
    };
    fillVoices(); if (hasTTS) speechSynthesis.onvoiceschanged = fillVoices;
    name.oninput = () => { settings.name = name.value.trim() || "Ozzy"; saveSettings(); };
    len.onchange = () => { settings.phraseLen = Number(len.value); saveSettings(); };
    voice.onchange = () => { settings.voice = voice.value; saveSettings(); };
    rate.oninput = () => { settings.rate = Number(rate.value); saveSettings(); };
    sfxBox.onchange = () => { settings.sfx = sfxBox.checked; saveSettings(); };
    $("#pTest", n).onclick = () => { say("Hello! Go there. Eat food.").catch(() => {}); };
    $("#pDone", n).onclick = goHome;
    $("#pReset", n).onclick = async () => {
      if (!confirm("Erase all progress, paintings and recordings on this device?")) return;
      prog.sessions = 0; prog.days = []; prog.attempts = 0; prog.gallery = []; saveProg(); try { await idb.clear(); } catch (e) { /* ignore */ } parentArea();
    };
    const box = $("#pRecs", n);
    try {
      const recs = (await idb.all()).sort((a, b) => b.ts - a.ts).slice(0, 80);
      box.textContent = "";
      if (!recs.length) box.textContent = "No recordings yet. They appear here when Ozzy uses the microphone button.";
      recs.forEach((r) => {
        const row = h("div", "rec", "<b></b>"); $("b", row).textContent = r.word + " · " + new Date(r.ts).toLocaleString();
        const play = h("button", "btn", "Play"), del = h("button", "btn grey", "Delete");
        play.onclick = () => playBoosted(r.blob); del.onclick = async () => { await idb.del(r.id); row.remove(); };
        row.append(play, del); box.append(row);
      });
    } catch (e) { box.textContent = "Recordings are not available in this browser."; }
  }

  holdButton(homeBtn, 900, goHome);
  window.__ozzy = { goHome, runSession, prog, settings };
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("/sw.js").catch(() => {});
  goHome();
})();
