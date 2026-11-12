"use strict";
/* The grown-ups area: progress report card, the 3-month plan, notes about what Dinaz and the family see,
   monthly check-ins, and settings. Everything is stored on this device only. */
(() => {
  const O = window.OFS, C = window.CURRICULUM, h = O.h, $ = O.$;
  const prog = O.prog, settings = O.settings, store = O.store;
  const TOTAL = C.LESSONS.length, PER_MONTH = TOTAL / C.MONTHS.length;

  const SKILLS = [
    ["colour", "Colours", true], ["sound", "Animal sounds", true], ["words", "Word pictures", true], ["feelings", "Feelings", true],
    ["count", "Counting objects", false], ["climb", "Counting rope", false], ["turns", "Taking turns", false],
    ["request", "Asking for things", false], ["story", "Story time", false], ["phrases", "Short phrases", false], ["splash", "Free painting", false],
  ];
  const TAGS = ["Looking and pointing", "Understanding", "Speaking and sounds", "Being with others", "Mood and behaviour", "Other"];
  const TYPES = [["good", "🌟 Good news"], ["watch", "👀 Worth watching"], ["note", "📝 Note"]];
  const RATINGS = ["Not yet", "Sometimes", "Often"];

  const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const fmtTs = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function state() {
    const done = prog.lessons.length, complete = done >= TOTAL, next = complete ? null : C.LESSONS[done];
    const week = complete ? C.WEEKS.length : next.week;
    return { done, complete, next, week, month: C.monthOfWeek(week), playedToday: !!done && prog.lessons[done - 1].day === O.today() };
  }

  /* ---------- photos for notes (kept in this browser, shrunk first) ---------- */
  function shrink(file) {
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
  }
  const putPhoto = async (file) => { const blob = await shrink(file); return O.idb.tx("readwrite", (s) => s.add({ blob, ts: Date.now() }), "media"); };
  const getPhoto = (id) => O.idb.tx("readonly", (s) => s.get(id), "media").then((r) => r && r.blob);

  /* ---------- shell ---------- */
  let tab = "progress";
  function open(t) {
    O.enter(); if (t) tab = t;
    const n = h("div", "parent");
    n.innerHTML = '<div class="phead"><h1>For grown-ups</h1><button class="btn grey" id="pBack">Back to play</button></div><div class="ptabs"></div><div class="pview"></div>';
    const bar = $(".ptabs", n), view = $(".pview", n);
    const views = { progress: viewProgress, plan: viewPlan, notes: viewNotes, settings: viewSettings };
    const go = (t2) => {
      tab = t2; bar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === t2));
      view.replaceChildren(); n.scrollTop = 0; views[t2](view, go);
    };
    [["progress", "Progress"], ["plan", "Plan"], ["notes", "Notes"], ["settings", "Settings"]].forEach(([k, label]) => {
      const b = h("button", "tab", label); b.dataset.t = k; b.onclick = () => go(k); bar.append(b);
    });
    $("#pBack", n).onclick = O.goHome;
    O.show(n); go(tab);
    n.go = go; n.view = view;
    return n;
  }

  /* ---------- progress: where he is, report card, check-ins ---------- */
  function viewProgress(c, go) {
    const st = state(), checkins = store.get("checkins", {}), events = store.get("events", []);
    const pct = Math.round(st.done / TOTAL * 100);
    const where = h("div", "box");
    where.innerHTML = '<div class="big">Week ' + st.week + ' of 12 · Month ' + st.month + ": " + C.MONTHS[st.month - 1].title + '</div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      "<p>" + st.done + " of " + TOTAL + " lessons finished. " +
      (st.complete ? "The 3-month plan is complete. Do the final check-in, then use the review to plan the next three months."
        : st.playedToday ? "Today’s lesson is done. Extra play today is bonus play and does not use up the next lesson."
          : "Next up: <b>" + esc(st.next.title) + "</b> (week " + st.next.week + ", day " + st.next.day + ").") + "</p>";
    c.append(h("h2", null, "Where we are"), where);

    const stats = h("div", "stats");
    [[prog.days.length, "days played"], [prog.sessions, "sessions"], [prog.together.length, "together moments"], [prog.attempts, "voice attempts"]]
      .forEach(([v, l]) => stats.append(h("div", "stat", "<b>" + v + "</b><span>" + l + "</span>")));
    c.append(stats, h("p", "soft", "Silent and very quiet voice attempts count too. This shows effort and practice, not a score."));

    const months = h("div", "box");
    C.MONTHS.forEach((m) => {
      const d = Math.max(0, Math.min(PER_MONTH, st.done - (m.n - 1) * PER_MONTH));
      months.append(h("div", "mrow", "<span>Month " + m.n + ": " + esc(m.title) + '</span><div class="bar sm"><i style="width:' + Math.round(d / PER_MONTH * 100) + '%"></i></div><small>' + d + "/" + PER_MONTH + "</small>"));
    });
    c.append(h("h2", null, "Month by month"), months);

    const rc = h("div", "box"); let any = false;
    SKILLS.forEach(([k, label, choice]) => {
      const s = prog.stats[k]; if (!s || !s.r) return; any = true;
      let line = "Practised " + s.r + (s.r === 1 ? " time" : " times");
      if (choice) {
        const ratio = s.f / s.r;
        line += ". Found the right picture straight away " + s.f + " of " + s.r + ": " + (s.r < 6 ? "just getting started" : ratio >= 0.8 ? "very steady" : ratio >= 0.5 ? "getting there" : "still learning, which is completely normal");
      }
      rc.append(h("div", "skill", "<b>" + label + "</b><span>" + line + "</span>"));
    });
    if (!any) rc.textContent = "The report card fills in after the first lessons.";
    c.append(h("h2", null, "Report card"), rc);

    c.append(h("h2", null, "Monthly check-ins"));
    const ci = h("div", "box");
    C.MONTHS.forEach((m) => {
      const saved = checkins[m.n], ready = st.done >= m.n * PER_MONTH, can = m.n <= st.month || saved;
      const row = h("div", "ci" + (ready && !saved ? " ready" : ""));
      row.innerHTML = "<span><b>Month " + m.n + "</b> " + (saved ? "✓ saved " + fmtTs(saved.ts) : ready ? "· ready for your check-in" : "· after week " + m.n * 4) + "</span>";
      if (can) { const b = h("button", "btn" + (saved ? " grey" : ""), saved ? "Edit" : ready ? "Start check-in" : "Start early"); b.onclick = () => checkin(m.n); row.append(b); }
      ci.append(row);
    });
    c.append(ci);

    c.append(h("h2", null, "Recent notes"));
    const rn = h("div", "box");
    if (!events.length) rn.textContent = "Nothing yet. Add a note whenever you see something, good or worrying, and it will count towards the next plan.";
    events.slice(-3).reverse().forEach((e) => rn.append(eventRow(e, null)));
    const add = h("button", "btn", "Add a note"); add.onclick = () => go("notes"); rn.append(add);
    c.append(rn);
  }

  /* ---------- the plan: every month, week and lesson ---------- */
  function viewPlan(c) {
    const st = state(), doneMap = {}; prog.lessons.forEach((l) => { doneMap[l.n] = l; });
    c.append(h("p", "soft", "Each day played moves to the next lesson in order, so a missed day never skips anything. Tap a week or lesson to see what it contains."));
    C.MONTHS.forEach((m) => {
      c.append(h("h2", null, "Month " + m.n + ": " + esc(m.title)), h("p", null, esc(m.intro)));
      C.WEEKS.filter((w) => w.month === m.n).forEach((w) => {
        const ls = C.LESSONS.filter((l) => l.week === w.n), nd = ls.filter((l) => doneMap[l.n]).length;
        const d = h("details", "wk"); if (w.n === st.week) d.open = true;
        d.innerHTML = "<summary><b>Week " + w.n + " · " + esc(w.title) + "</b><span>" + nd + "/" + ls.length + "</span></summary><p>" + esc(w.focus) + "</p><p><b>Together:</b> " + esc(w.together) + "</p>";
        ls.forEach((l) => {
          const dn = doneMap[l.n], isNext = !st.complete && l.n === st.done + 1;
          const e = h("details", "ls " + (dn ? "done" : isNext ? "upnext" : ""));
          e.innerHTML = "<summary>" + (dn ? "✓" : isNext ? "●" : "○") + " Day " + l.day + " · " + l.icon + " " + esc(l.title) + (dn ? " <small>" + fmtDay(dn.day) + "</small>" : isNext ? " <small>up next</small>" : "") + "</summary>" +
            "<p><b>What it contains:</b> " + esc(l.contains) + "</p><p><b>Why:</b> " + esc(l.why) + "</p><p><b>Together moment:</b> " + esc(l.together) + "</p>";
          d.append(e);
        });
        c.append(d);
      });
    });
  }

  /* ---------- notes: what the family sees ---------- */
  function eventRow(e, onDelete) {
    const t = TYPES.find((x) => x[0] === e.type) || TYPES[2];
    const row = h("div", "ev " + e.type);
    row.innerHTML = '<div class="evh"><b>' + t[1] + "</b><small>" + fmtTs(e.ts) + "</small></div>";
    if (e.tags && e.tags.length) row.append(h("div", "tags", e.tags.map((g) => "<span>" + esc(g) + "</span>").join("")));
    if (e.text) { const p = h("p"); p.textContent = e.text; row.append(p); }
    if (e.media) getPhoto(e.media).then((b) => { if (b) { const img = h("img", "evimg"); img.src = URL.createObjectURL(b); img.alt = "Attached photo"; row.append(img); } }).catch(() => {});
    if (onDelete) { const del = h("button", "btn grey", "Delete"); del.onclick = () => onDelete(e); row.append(del); }
    return row;
  }
  function viewNotes(c, go) {
    let type = "good"; const tags = new Set();
    const f = h("div", "box");
    f.innerHTML = '<div class="soft">What kind of moment?</div><div class="chipsrow" id="evType"></div><div class="soft">Which area? (optional)</div><div class="chipsrow" id="evTags"></div>' +
      '<textarea id="evText" rows="4" placeholder="What happened? For example: He pointed at the cow and looked at me."></textarea>' +
      '<label>Photo or drawing (optional) <input type="file" id="evPhoto" accept="image/*"></label><button class="btn" id="evSave">Save note</button><span id="evMsg" class="soft"></span>';
    TYPES.forEach(([k, label]) => { const b = h("button", "chip2" + (k === type ? " on" : ""), label); b.onclick = () => { type = k; $("#evType", f).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); }; $("#evType", f).append(b); });
    TAGS.forEach((g) => { const b = h("button", "chip2", g); b.onclick = () => { tags.has(g) ? tags.delete(g) : tags.add(g); b.classList.toggle("on", tags.has(g)); }; $("#evTags", f).append(b); });
    $("#evSave", f).onclick = async () => {
      const text = $("#evText", f).value.trim(), file = $("#evPhoto", f).files[0];
      if (!text && !file) { $("#evMsg", f).textContent = " Write a few words or add a photo first."; return; }
      $("#evSave", f).disabled = true;
      let media = null; if (file) { try { media = await putPhoto(file); } catch (e) { media = null; } }
      const events = store.get("events", []);
      events.push({ id: Date.now(), ts: Date.now(), type, tags: [...tags], text, media }); store.set("events", events);
      go("notes");
    };
    c.append(h("p", "soft", "Add anything you notice, good or worrying, as soon as it happens. These notes feed the review that shapes the next three months."), f, h("h2", null, "All notes"));
    const list = h("div", "box"), events = store.get("events", []);
    if (!events.length) list.textContent = "No notes yet.";
    events.slice().reverse().forEach((e) => list.append(eventRow(e, async (ev) => {
      if (!confirm("Delete this note?")) return;
      store.set("events", store.get("events", []).filter((x) => x.id !== ev.id));
      if (ev.media) { try { await O.idb.tx("readwrite", (s) => s.delete(ev.media), "media"); } catch (er) { /* ignore */ } }
      go("notes");
    })));
    c.append(list);
  }

  /* ---------- monthly check-in ---------- */
  function checkin(m) {
    const n = open("progress"), month = C.MONTHS[m - 1], saved = store.get("checkins", {})[m] || {};
    const view = n.view; view.replaceChildren();
    const ratings = (saved.ratings || []).slice();
    view.innerHTML = "<h2>Month " + m + " check-in: " + esc(month.title) + '</h2><p class="soft">Tell us what you have seen this month. There are no right answers, and small changes count. This shapes the next plan.</p><div class="box" id="ciBox"></div>';
    const box = $("#ciBox", view);
    month.checks.forEach((label, i) => {
      const row = h("div", "rate"); row.append(h("div", null, esc(label)));
      const opts = h("div", "chipsrow");
      RATINGS.forEach((r, v) => { const b = h("button", "chip2" + (ratings[i] === v ? " on" : ""), r); b.onclick = () => { ratings[i] = v; opts.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); }; opts.append(b); });
      row.append(opts); box.append(row);
    });
    [["improved", "What improved?"], ["same", "What did not change?"], ["enjoyed", "What did he enjoy, or avoid?"], ["other", "Anything else for his therapist or the next plan?"]].forEach(([k, q]) => {
      const l = h("label", null, esc(q)), ta = h("textarea"); ta.rows = 3; ta.value = saved[k] || ""; ta.dataset.k = k; l.append(ta); box.append(l);
    });
    const save = h("button", "btn", "Save check-in"), cancel = h("button", "btn grey", "Cancel");
    save.onclick = () => {
      const rec = { ts: Date.now(), ratings: month.checks.map((_, i) => (ratings[i] == null ? null : ratings[i])) };
      box.querySelectorAll("textarea").forEach((t) => { rec[t.dataset.k] = t.value.trim(); });
      const all = store.get("checkins", {}); all[m] = rec; store.set("checkins", all); open("progress");
    };
    cancel.onclick = () => open("progress"); box.append(save, cancel);
  }

  /* ---------- settings, recordings, backup ---------- */
  function backup() {
    const data = { app: "ozzy-farm-studio", version: 2, exported: new Date().toISOString(), settings, prog, events: store.get("events", []), checkins: store.get("checkins", {}) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "ozzy-farm-studio-backup-" + O.today() + ".json"; a.click();
  }
  async function viewSettings(c, go) {
    const box = h("div", "box");
    box.innerHTML =
      '<label>Child’s name <input type="text" id="pName" maxlength="20"></label>' +
      '<label>Phrase length <select id="pLen"><option value="plan">Follow the plan</option><option value="2">Always 2 words (go there, eat food)</option><option value="3">Always 3 words (I want ball)</option></select></label>' +
      '<label>Voice <select id="pVoice"></select></label>' +
      '<label>Speaking speed <input type="range" id="pRate" min="0.5" max="1.1" step="0.05"></label>' +
      '<label><input type="checkbox" id="pSfx"> Play soft sound effects</label><button class="btn grey" id="pTest">Hear a test</button>';
    c.append(h("h2", null, "Settings"), box);
    const name = $("#pName", box), len = $("#pLen", box), voice = $("#pVoice", box), rate = $("#pRate", box), sfxBox = $("#pSfx", box);
    name.value = settings.name; len.value = settings.phraseMode; rate.value = settings.rate; sfxBox.checked = settings.sfx;
    const fillVoices = () => {
      const vs = O.hasTTS ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
      voice.innerHTML = '<option value="">Automatic</option>' + vs.map((v) => '<option value="' + esc(v.voiceURI) + '">' + esc(v.name) + " (" + esc(v.lang) + ")</option>").join("");
      voice.value = settings.voice;
    };
    fillVoices(); if (O.hasTTS) speechSynthesis.onvoiceschanged = fillVoices;
    name.oninput = () => { settings.name = name.value.trim() || "Ozzy"; O.saveSettings(); };
    len.onchange = () => { settings.phraseMode = len.value; O.saveSettings(); };
    voice.onchange = () => { settings.voice = voice.value; O.saveSettings(); };
    rate.oninput = () => { settings.rate = Number(rate.value); O.saveSettings(); };
    sfxBox.onchange = () => { settings.sfx = sfxBox.checked; O.saveSettings(); };
    $("#pTest", box).onclick = () => { O.say("Hello! Go there. Eat food.").catch(() => {}); };

    const data = h("div", "box");
    data.innerHTML = "<p>Everything is saved only on this device and nothing is uploaded. A backup file keeps progress, notes and check-ins safe (it does not include recordings or photos).</p>";
    const bk = h("button", "btn", "Download backup"); bk.onclick = backup;
    const rp = h("button", "btn grey", "Restart the plan from week 1");
    rp.onclick = () => { if (!confirm("Restart from week 1? Notes, check-ins and paintings are kept.")) return; prog.lessons = []; prog.together = []; O.saveProg(); go("progress"); };
    const er = h("button", "btn red", "Erase all progress, notes and recordings");
    er.onclick = async () => {
      if (!confirm("Erase all progress, paintings, notes and recordings on this device?")) return;
      prog.sessions = 0; prog.days = []; prog.attempts = 0; prog.gallery = []; prog.lessons = []; prog.together = []; prog.stats = {}; O.saveProg();
      store.set("events", []); store.set("checkins", {});
      try { await O.idb.clear(); await O.idb.tx("readwrite", (s) => s.clear(), "media"); } catch (e) { /* ignore */ }
      go("settings");
    };
    data.append(bk, rp, er); c.append(h("h2", null, "Your data"), data);

    c.append(h("h2", null, "Recorded attempts"));
    const rbox = h("div", "box"); c.append(rbox);
    try {
      const recs = (await O.idb.all()).sort((a, b) => b.ts - a.ts).slice(0, 80);
      rbox.textContent = "";
      if (!recs.length) rbox.textContent = "No recordings yet. They appear here when Ozzy uses the microphone button.";
      recs.forEach((r) => {
        const row = h("div", "rec", "<b></b>"); $("b", row).textContent = r.word + " · " + new Date(r.ts).toLocaleString();
        const play = h("button", "btn", "Play"), del = h("button", "btn grey", "Delete");
        play.onclick = () => O.playBoosted(r.blob); del.onclick = async () => { await O.idb.del(r.id); row.remove(); };
        row.append(play, del); rbox.append(row);
      });
    } catch (e) { rbox.textContent = "Recordings are not available in this browser."; }
    c.append(h("h2", null, "Make it personal"), h("p", null, "Put photos of your own animals in <code>public/photos</code> (dog.jpg, cat.jpg, hen.jpg, hamster.jpg, cow.jpg, sheep.jpg) and recordings in <code>public/sounds</code> (dog.mp3, cat.mp3, hen.mp3…). The app picks them up after you redeploy."));
  }

  O.openParent = () => open("progress");
})();
