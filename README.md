# Ozzy’s Farm Studio

A calm, painting-themed daily play session for Ozzy (about 15 minutes), now following a **3-month learning plan** of 72 lessons. Everything he does adds colour to a farm painting, which is saved to a gallery at the end.

## How a day works
1. **Hello** with Pip the dog (optional: say it)
2. **Two activities** chosen by the lesson’s theme
3. **Three short phrases** (2 words, moving to 3 words in the last weeks)
4. **Finished painting** saved to the gallery
5. **Together moment**: a short activity for a grown-up or cousin (shown on the 🤝 button after the painting)

Rules: tapping only, 2–3 big pictures per screen, wrong taps just wobble, the right answer glows after a while, the microphone is always optional, and any sound counts. Questions are spoken aloud (“Where is the cow?” from Month 2).

## The plan
`public/curriculum.js` holds the plan as data: 3 months, 12 weeks, 6 themed days a week.

| Day | Theme | Activities |
| --- | --- | --- |
| 1 | Colour Day | colours, free splashing |
| 2 | Farm Sounds and Words | animal sounds, word pictures |
| 3 | Number Stories | counting objects, counting rope |
| 4 | Feelings and Friends | feelings faces, taking turns with Pip |
| 5 | Adventure Day | story with Pip, word pictures |
| 6 | Free Painting | asking for “more” and “help”, splashing, a favourite |

One new lesson unlocks per day played, in order, so a missed day never skips anything. A second session on the same day is bonus play and does not advance the plan. The picture on the play button shows today’s theme.

## Grown-ups area
On the home screen, press and hold the small faint circle (bottom right) for 1.5 seconds.
- **Progress**: week and month, report card per skill, together moments, monthly check-ins
- **Plan**: every month, week and lesson with what it contains, why, and its together moment
- **Notes**: log good news or worries as they happen, tag the area, attach a photo or drawing
- **Settings**: name, phrase length (follow the plan, or always 2 or 3), voice, speed, recordings, **backup file**, restart plan

Everything is stored on the device only. Use *Download backup* now and then.

## Roadmap
- **Phase 1 (this)**: plan engine, Month 1 activities, spoken questions, grown-ups dashboard, notes and check-ins
- **Phase 2**: Month 2 content (number stories such as 3 crows, yes/no, “first, then”, greetings)
- **Phase 3**: Month 3 content (waiting, sharing, everyday-place stories) and the self-learning loop that turns three months of progress, notes and check-ins into the next plan
- **Later**: logins for other families, shared notes and attachments

## Make it personal
- Photos of his own animals: put `dog.jpg`, `cat.jpg`, `hen.jpg`, `hamster.jpg`, `cow.jpg`, `sheep.jpg` in `public/photos/`
- Real animal sounds: put `dog.mp3`, `cat.mp3`, `hen.mp3`… in `public/sounds/`

## Run and deploy
```
npm start        # http://localhost:3000
npm install && npm test
```
`npm test` plays all 72 lessons in a simulated browser and exercises the grown-ups area. Push to GitHub, then on Railway choose **Deploy from GitHub repo**. No variables are needed. The microphone needs HTTPS, which Railway provides. On an iPad, open the link in Safari and use Share → Add to Home Screen.
