"use strict";
// Plays the whole live plan (Months 1-2, 48 lessons, one simulated day each) in a simulated browser, then exercises the grown-ups area.
const { JSDOM, VirtualConsole } = require("jsdom");
const server = require("../server");
const C = require("../public/curriculum");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let errors = [];
const fail = (m) => { throw new Error(m); };

async function playSession(dom, label) {
  const { window } = dom, d = window.document;
  const start = Date.now();
  d.querySelector(".play").click();
  let zoomed = false;
  while (Date.now() - start < 45000) {
    await wait(20);
    if (d.querySelector(".finale.done")) return;
    if (!zoomed && d.querySelector("#thumb svg")) {
      zoomed = true; d.querySelector("#thumb").click();
      if (!d.querySelector("#app > .overlay svg")) fail("zoom overlay did not open");
      d.querySelector("#app > .overlay").click();
      if (d.querySelector("#app > .overlay")) fail("zoom overlay did not close");
    }
    const el = d.querySelector(".card[data-correct]") || d.querySelector(".card[data-any]") || d.querySelector(".respond .next") ||
      d.querySelector(".item:not([data-got])") || d.querySelector(".round.up") || d.querySelector(".splashpad") || d.querySelector(".turnpad.mine") || d.querySelector(".ftbox:not(.locked):not(.done)") || d.querySelector(".greetbtn");
    if (el) el.click();
  }
  fail(label + ": session did not finish. Stage: " + d.querySelector("#stage").innerHTML.slice(0, 300));
}

(async () => {
  // curriculum sanity
  const TOTAL = C.LESSONS.length; if (TOTAL !== 48 || C.WEEKS.length !== 8) fail("expected 48 lessons in 8 weeks, got " + TOTAL);
  C.LESSONS.forEach((l) => { if (!l.together || !l.contains || !l.why || !l.focus) fail("lesson " + l.n + " is missing text"); if (!C.actsFor(l).length) fail("lesson " + l.n + " has no activities"); });

  await new Promise((r) => server.listen(0, r));
  const url = "http://localhost:" + server.address().port + "/";
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { if (/fonts\.googleapis|ENOTFOUND/.test(String(e.message))) return; errors.push(String(e.stack || e)); });
  vc.on("error", (e) => errors.push(String(e)));
  const dom = await JSDOM.fromURL(url, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.__fast = true; w.confirm = () => true; } });
  await wait(500);
  const w = dom.window, d = w.document, prog = w.__ozzy.prog;
  if (!d.querySelector(".play")) fail("home screen missing");
  if (!d.querySelector(".tbadge").textContent) fail("today's badge missing");

  // lesson 1 was already done by Ozzy, so the plan starts at lesson 2
  if (prog.lessons.length !== 1 || prog.lessons[0].n !== 1 || !prog.lessons[0].pre) fail("lesson 1 should be pre-completed");
  // one real lesson, then bonus play the same day must not advance the plan
  await playSession(dom, "lesson 2");
  if (prog.lessons.length !== 2) fail("first session should finish lesson 2");
  d.querySelector(".finale .round.next").click(); await wait(30);
  await playSession(dom, "bonus");
  if (prog.lessons.length !== 2) fail("bonus play advanced the plan");
  if (prog.sessions !== 2) fail("sessions should be 2");
  // together moment: shows the lesson's text and saves on press-and-hold
  d.querySelector(".finale .round.together").click(); await wait(30);
  if (!d.querySelector(".tgbox p").textContent) fail("together text missing");
  d.querySelector("#tgYes").dispatchEvent(new w.Event("pointerdown")); await wait(60);
  if (prog.together.length !== 1) fail("together moment was not saved");
  d.querySelector("#tgHome").click(); await wait(30);

  // the rest of the plan: one simulated day per lesson
  for (let i = 3; i <= TOTAL; i++) {
    prog.lessons.forEach((l) => { l.day = "2000-01-01"; });
    prog.gallery.forEach((g) => { g.ts -= 3 * 864e5; }); // earlier paintings are now a few days old, so recall can use them
    await playSession(dom, "lesson " + i);
    if (prog.lessons.length !== i) fail("lesson " + i + " did not complete (" + prog.lessons.length + ")");
    if (!prog.gallery[prog.gallery.length - 1].fills.every(Boolean)) fail("lesson " + i + " left painting regions empty");
    d.querySelector(".finale .round.next").click(); await wait(10);
  }
  if (prog.lessons.length !== TOTAL) fail("plan should be complete");
  prog.lessons.forEach((l, i) => { if (l.n !== i + 1) fail("lessons out of order at " + i); });
  ["colour", "sound", "words", "count", "climb", "feelings", "turns", "request", "story", "phrases", "splash", "yesno", "crows", "firstthen", "greet", "ask2", "feelstory", "recall"].forEach((k) => {
    if (!prog.stats[k] || !prog.stats[k].r) fail("no progress tracked for " + k);
  });
  // every painting remembers up to three words and a few extras
  if (prog.gallery.some((g) => !Array.isArray(g.words) || g.words.length > 3 || !Array.isArray(g.extras) || g.extras.length > 4)) fail("painting memory data malformed");
  if (prog.gallery.filter((g) => g.words.length === 3).length < prog.gallery.length * 0.6) fail("most paintings should remember three words");
  if (!prog.gallery.some((g) => g.extras.length >= 2)) fail("paintings should gain extras");
  if (!prog.gallery.some((g) => g.words.some((x) => x.e && x.q))) fail("some words should be recallable");
  if (!prog.adaptLog.length) fail("the app should have adapted difficulty after many easy rounds");
  if (Object.values(prog.adapt).some((v) => v > 2 || v < -2)) fail("adaptation out of range");
  // after the plan: still playable as bonus
  await playSession(dom, "after plan"); if (prog.lessons.length !== TOTAL) fail("plan advanced past the end");
  d.querySelector(".finale .round.next").click(); await wait(30);

  // gallery: tap a painting to hear its words; grown-ups panel opens on press-and-hold
  d.querySelector(".row .round").click(); await wait(40);
  if (d.querySelectorAll(".tilewrap .tile").length !== prog.gallery.length) fail("gallery tiles: " + d.querySelectorAll(".tilewrap .tile").length);
  if (!d.querySelector(".cap span, .cap i")) fail("gallery stickers missing");
  d.querySelector(".tilewrap .tile").click(); await wait(40);
  if (!d.querySelector(".pnt .wchip") || !d.querySelector(".pnt .hear")) fail("painting overlay missing words");
  d.querySelector(".pnt .gbtn").dispatchEvent(new w.Event("pointerdown")); await wait(60);
  if (d.querySelector(".pnt .gpanel").hidden) fail("grown-ups panel did not open");
  if (!/What did we paint here/.test(d.querySelector(".pnt .gpanel p").textContent)) fail("grown-up prompt missing");
  d.querySelector(".pnt .pclose").click(); if (d.querySelector(".pnt")) fail("overlay did not close");
  d.querySelector(".gallery .round.next").click(); await wait(30);

  // grown-ups area
  d.querySelector(".dot").dispatchEvent(new w.Event("pointerdown")); await wait(80);
  if (!d.querySelector(".parent")) fail("grown-ups screen did not open");
  if (!/Week 8 of 8/.test(d.querySelector(".parent").textContent)) fail("progress should show week 8 of 8");
  if (!/48 of 48/.test(d.querySelector(".parent").textContent)) fail("progress should show 48 of 48");
  if (!d.querySelector(".skill")) fail("report card empty");
  const tabs = () => [...d.querySelectorAll(".ptabs .tab")];
  tabs()[1].click(); await wait(30);
  if (d.querySelectorAll("details.ls").length !== TOTAL) fail("plan should list all lessons, got " + d.querySelectorAll("details.ls").length);
  if (d.querySelectorAll("details.ls.done").length !== TOTAL) fail("all lessons should show done");
  tabs()[2].click(); await wait(30);
  d.querySelector("#evText").value = "He pointed at the cow and looked at me.";
  d.querySelector("#evTags button").click();
  d.querySelector("#evSave").click(); await wait(60);
  const evs = JSON.parse(w.localStorage.getItem("ofs:events") || "[]");
  if (evs.length !== 1 || evs[0].tags.length !== 1 || evs[0].type !== "good") fail("note not saved: " + JSON.stringify(evs));
  if (!/pointed at the cow/.test(d.querySelector(".parent").textContent)) fail("note not shown");
  tabs()[0].click(); await wait(30);
  const startCI = [...d.querySelectorAll(".ci .btn")][0]; if (!startCI) fail("no check-in button"); startCI.click(); await wait(30);
  d.querySelector(".rate .chip2").click(); d.querySelector("#ciBox textarea").value = "Settled in well.";
  [...d.querySelectorAll("#ciBox .btn")].find((b) => /Save/.test(b.textContent)).click(); await wait(30);
  const cis = JSON.parse(w.localStorage.getItem("ofs:checkins") || "{}");
  if (!cis[1] || cis[1].improved !== "Settled in well." || cis[1].ratings[0] !== 0) fail("check-in not saved: " + JSON.stringify(cis));
  tabs()[3].click(); await wait(30);
  const rv = d.querySelector(".review").textContent;
  ["PROGRESS", "SKILLS IN THE APP", "ADJUSTMENTS THE APP MADE", "MONTHLY CHECK-INS", "NOTES FROM THE FAMILY", "SUGGESTED FOCUS"].forEach((h) => { if (!rv.includes(h)) fail("review missing " + h); });
  if (!/pointed at the cow/.test(rv) || !/Settled in well/.test(rv) || !/Settles into the routine: Not yet/.test(rv)) fail("review missing notes or check-in");
  if (!/Keep building: settles into the routine/.test(rv)) fail("review should suggest focus from a 'Not yet' rating");
  if (!/PAINTINGS AND MEMORIES/.test(rv)) fail("review missing paintings section");
  if (![...d.querySelectorAll(".btn")].some((b) => /Month 1 \(/.test(b.textContent))) fail("gallery book buttons missing");
  const book = await w.OFS.buildBookHTML(1);
  if (!/gallery book: Month 1/.test(book) || !/<svg/.test(book) || !/class="w"/.test(book)) fail("gallery book html wrong");
  tabs()[4].click(); await wait(60);
  if (!d.querySelector("#pName") || ![...d.querySelectorAll(".btn")].some((b) => /backup/i.test(b.textContent))) fail("settings missing");
  d.querySelector("#pBack").click(); await wait(30);
  if (!d.querySelector(".home")) fail("back to play failed");

  // leaving mid-session must not break anything
  d.querySelector(".play").click(); await wait(80);
  d.querySelector("#homeBtn").dispatchEvent(new w.Event("pointerdown")); await wait(80);
  if (!d.querySelector(".home")) fail("hold-to-go-home failed");
  await wait(300);

  if (errors.length) fail("Browser errors:\n" + errors.slice(0, 5).join("\n"));
  console.log("OK: all " + TOTAL + " lessons play to a finished painting in order; adaptation, bonus play and plan end handled; together moment, report card, plan, notes, check-in, review and settings all work.");
  w.close(); server.close(); process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
