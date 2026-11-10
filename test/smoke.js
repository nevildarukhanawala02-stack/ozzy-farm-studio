"use strict";
// Plays full sessions in a simulated browser: checks nothing throws and every session reaches the finished painting.
const { JSDOM, VirtualConsole } = require("jsdom");
const server = require("../server");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let errors = [];

async function playSession(dom, label) {
  const { window } = dom, d = window.document;
  const start = Date.now();
  d.querySelector(".play").click();
  while (Date.now() - start < 45000) {
    await wait(25);
    if (d.querySelector(".finale.done")) return;
    const el = d.querySelector(".card[data-correct]") || d.querySelector(".respond .next") || d.querySelector(".item:not([data-got])") || d.querySelector(".round.up");
    if (el) el.click();
  }
  throw new Error(label + ": session did not finish. Stage: " + d.querySelector("#stage").innerHTML.slice(0, 300));
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = "http://localhost:" + server.address().port + "/";
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { if (/fonts\.googleapis|ENOTFOUND/.test(String(e.message))) return; errors.push(String(e.stack || e)); });
  vc.on("error", (e) => errors.push(String(e)));
  const dom = await JSDOM.fromURL(url, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.__fast = true; w.confirm = () => true; } });
  await wait(400);
  const w = dom.window, d = w.document;
  if (!d.querySelector(".play")) throw new Error("home screen missing");

  for (const len of [2, 3]) {
    w.__ozzy.settings.phraseLen = len;
    for (let i = 0; i < 5; i++) {
      await playSession(dom, "phraseLen " + len + " session " + (i + 1));
      d.querySelector(".finale .round.next").click(); // back to home
      await wait(30);
    }
  }
  if (w.__ozzy.prog.sessions !== 10) throw new Error("expected 10 sessions, got " + w.__ozzy.prog.sessions);
  const paintedAll = w.__ozzy.prog.gallery.every((g) => g.fills.every(Boolean));
  if (!paintedAll) throw new Error("a saved painting has unpainted regions");

  // gallery and grown-ups screens
  d.querySelector(".row .round").click(); await wait(30);
  if (d.querySelectorAll(".tile").length !== 10) throw new Error("gallery tiles: " + d.querySelectorAll(".tile").length);
  d.querySelector(".gallery .round").click(); await wait(30);
  d.querySelector(".dot").dispatchEvent(new w.Event("pointerdown")); await wait(60);
  if (!d.querySelector(".parent")) throw new Error("grown-ups screen did not open");
  d.querySelector("#pDone").click(); await wait(30);

  // leaving mid-session must not break anything
  d.querySelector(".play").click(); await wait(80);
  d.querySelector("#homeBtn").dispatchEvent(new w.Event("pointerdown")); await wait(80);
  if (!d.querySelector(".home")) throw new Error("hold-to-go-home failed");
  await wait(300);

  if (errors.length) throw new Error("Browser errors:\n" + errors.join("\n"));
  console.log("OK: 10 full sessions (5 with 2-word and 5 with 3-word phrases), gallery, grown-ups screen and early exit all pass.");
  w.close(); server.close(); process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
