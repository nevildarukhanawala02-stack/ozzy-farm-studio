"use strict";
/* The 3-month plan as data. The app (app.js) plays lessons from it and the grown-ups area (parent.js) shows it.
   72 lessons = 12 weeks x 6 themed days. Lessons advance one per day played, in order, so a missed day
   never skips content. Works in the browser (window.CURRICULUM) and in Node (module.exports). */
(function (root) {
  const THEMES = [
    { id: "colour", name: "Colour Day", icon: "🎨",
      contains: "Finds and names colours, then splashes paint across a big canvas.",
      why: "Naming and matching colours builds early word understanding and gives easy, joyful wins." },
    { id: "sounds", name: "Farm Sounds and Words", icon: "🐄",
      contains: "Matches farm animals to their sounds and finds named pictures.",
      why: "Listening and matching build understanding of words before speaking." },
    { id: "numbers", name: "Number Stories", icon: "🧺",
      contains: "Counts pebbles, eggs and shells one by one, and climbs a counting rope.",
      why: "Counting real things, one at a time, builds a solid sense of number." },
    { id: "feelings", name: "Feelings and Friends", icon: "😊",
      contains: "Matches simple faces to feelings, then takes turns painting with Pip.",
      why: "Naming feelings and taking turns are the first building blocks of playing with others." },
    { id: "adventure", name: "Adventure Day", icon: "🏖️",
      contains: "A short story journey with Pip, with pictures to find along the way.",
      why: "Stories link words into sequences and give words a place to be used." },
    { id: "free", name: "Free Painting", icon: "🖌️",
      contains: "Asks for paint and help by tapping, paints freely and replays a favourite.",
      why: "Choice and asking for things build confidence and early communication." },
  ];

  /* cfg drives difficulty: colours (how many), animals, count (counting rope/basket up to), faces, phraseLen, questions (spoken as real questions) */
  const WEEKS = [
    { n: 1, month: 1, title: "Settling in", focus: "Getting comfortable with the routine and with Pip.",
      together: "Sit side by side and look at the painting together.",
      cfg: { colours: 3, animals: 3, count: 3, faces: 2, phraseLen: 2, questions: false } },
    { n: 2, month: 1, title: "Finding and pointing", focus: "Tapping the picture that is named, and pointing.",
      together: "Take turns pointing at pictures while a grown-up names them.",
      cfg: { colours: 5, animals: 4, count: 5, faces: 2, phraseLen: 2, questions: false } },
    { n: 3, month: 1, title: "Requesting", focus: "Asking for “more” and “help” by tapping a picture.",
      together: "Pass the brush back and forth: your turn, my turn.",
      cfg: { colours: 5, animals: 4, count: 5, faces: 2, phraseLen: 2, questions: false } },
    { n: 4, month: 1, title: "Show-off week", focus: "Replaying favourites and enjoying the gallery.",
      together: "Show a finished painting to a family member.",
      cfg: { colours: 5, animals: 4, count: 5, faces: 2, phraseLen: 2, questions: false }, showoff: true },
    { n: 5, month: 2, title: "Answering questions", focus: "Real questions such as “Where is the cow?”, answered by tapping.",
      together: "Ask one simple question at mealtime and wait for any answer.",
      cfg: { colours: 7, animals: 6, count: 5, faces: 3, phraseLen: 2, questions: true } },
    { n: 6, month: 2, title: "Two-word requests", focus: "Asking with two words (or two taps), with optional voice.",
      together: "Offer a choice of two snacks and wait for a point or a sound.",
      cfg: { colours: 7, animals: 6, count: 5, faces: 3, phraseLen: 2, questions: true } },
    { n: 7, month: 2, title: "Feelings and story maths", focus: "Happy, sad and cross faces, and counting in picture stories.",
      together: "Name feelings during a favourite video or a walk on the farm.",
      cfg: { colours: 7, animals: 6, count: 5, faces: 3, phraseLen: 2, questions: true } },
    { n: 8, month: 2, title: "Show-off week", focus: "Replaying favourites and a “first, then” picture routine.",
      together: "Wave and say “hi” to a visitor or on a video call.",
      cfg: { colours: 7, animals: 6, count: 5, faces: 3, phraseLen: 2, questions: true }, showoff: true },
    { n: 9, month: 3, title: "Turns and sharing", focus: "“My turn, your turn” and sharing paint with Pip.",
      together: "Play a short game with Ariana or a cousin, taking turns.",
      cfg: { colours: 7, animals: 6, count: 10, faces: 4, phraseLen: 2, questions: true } },
    { n: 10, month: 3, title: "Waiting and asking for help", focus: "Waiting a little, and asking for help.",
      together: "Practise a short wait, then reward with a favourite activity.",
      cfg: { colours: 7, animals: 6, count: 10, faces: 4, phraseLen: 2, questions: true } },
    { n: 11, month: 3, title: "Everyday places", focus: "Picture stories about everyday places, with three-word phrases.",
      together: "Visit a real shop or a neighbour and say or signal “hello”.",
      cfg: { colours: 7, animals: 6, count: 10, faces: 4, phraseLen: 3, questions: true } },
    { n: 12, month: 3, title: "Show-off week", focus: "Choosing favourites and sharing his gallery.",
      together: "He shows his gallery to family or friends and says “look!”.",
      cfg: { colours: 7, animals: 6, count: 10, faces: 4, phraseLen: 3, questions: true }, showoff: true },
  ];

  const MONTHS = [
    { n: 1, title: "Notice and Connect",
      intro: "Comfort with the routine and the first links between Ozzy and another person: looking, pointing, finding and turn-taking. Spoken words stay optional.",
      checks: ["Settles into the routine", "Looks at the person beside him", "Points to things", "Reaches for or taps a picture"] },
    { n: 2, title: "Ask and Share",
      intro: "From finding to asking: answering simple questions, making requests, understanding feelings and following a short sequence.",
      checks: ["Answers questions by pointing, tapping or a sound", "Asks for things, even without words", "Recognises happy, sad and cross faces", "Follows a short “first, then” sequence"] },
    { n: 3, title: "Together",
      intro: "Bringing the skills into everyday life with other people: sharing, waiting, asking for help, and short stories about places he will meet.",
      checks: ["Shares attention with others", "Takes a turn", "Waits briefly", "Shows things to people"] },
  ];

  const PER_WEEK = THEMES.length;
  const LESSONS = [];
  WEEKS.forEach((w) => THEMES.forEach((t, i) => {
    LESSONS.push({ n: LESSONS.length + 1, week: w.n, month: w.month, day: i + 1, theme: t.id, title: t.name,
      icon: t.icon, contains: t.contains, why: t.why, focus: w.focus, together: w.together, cfg: w.cfg, showoff: !!w.showoff });
  }));

  function actsFor(lesson) {
    switch (lesson.theme) {
      case "colour": return ["colour", "splash"];
      case "sounds": return ["sound", "words"];
      case "numbers": return ["count", "climb"];
      case "feelings": return ["feelings", "turns"];
      case "adventure": return ["story", "words"];
      default: return lesson.week >= 3 ? ["request", "splash"] : ["splash", "fav"];
    }
  }

  /* Extra play on a day when today's lesson is already done. It never advances the plan. */
  function freeLesson(week) {
    const w = WEEKS[Math.min(Math.max(week, 1), WEEKS.length) - 1], t = THEMES[5];
    return { n: 0, week: w.n, month: w.month, day: 6, theme: "free", title: "Bonus play", icon: t.icon, contains: t.contains,
      why: t.why, focus: w.focus, together: w.together, cfg: w.cfg, showoff: false };
  }

  const API = { THEMES, WEEKS, MONTHS, LESSONS, PER_WEEK, actsFor, freeLesson,
    themeById: (id) => THEMES.find((t) => t.id === id),
    monthOfWeek: (wk) => WEEKS[wk - 1].month };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.CURRICULUM = API;
})(typeof window !== "undefined" ? window : globalThis);
