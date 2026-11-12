# Ozzy’s Farm Studio

A calm, painting-themed daily play session for Ozzy (about 15 minutes), now following a **learning plan**: Months 1 and 2 are live (48 lessons over 8 weeks); Month 3 is written and held back until feedback comes in. Everything he does adds colour to a farm painting, which is saved to a gallery at the end.

## How a day works
1. **Hello** with Pip the dog (optional: say it)
2. **Two activities** chosen by the lesson’s theme
3. **Three short phrases** (2 words, moving to 3 words in the last weeks)
4. **Finished painting** saved to the gallery
5. **Together moment**: a short activity for a grown-up or cousin (shown on the 🤝 button after the painting)

Rules: tapping only, 2–3 big pictures per screen, wrong taps just wobble, the right answer glows after a while, the microphone is always optional, and any sound counts. Questions are spoken aloud (“Where is the cow?” from Month 2).

## The plan
`public/curriculum.js` holds the plan as data: 6 themed days a week. Months 1 and 2 are live; set `LIVE_MONTHS` there to switch on Month 3 when it is ready.

| Day | Theme | Activities |
| --- | --- | --- |
| 1 | Colour Day | colours, free splashing |
| 2 | Farm Sounds and Words | animal sounds, word pictures |
| 3 | Number Stories | counting objects, counting rope |
| 4 | Feelings and Friends | feelings faces, taking turns with Pip |
| 5 | Adventure Day | story with Pip, word pictures |
| 6 | Free Painting | asking for “more” and “help” (two-word requests from week 6), splashing, a favourite |

From week 5 the mix grows: crow number stories (3 crows sit, 1 flies away, how many are left?), yes/no, “first, then” picture routines, greetings (hi, thank you, bye bye) and “how does Pip feel?” stories.

One new lesson unlocks per day played, in order, so a missed day never skips anything. A second session on the same day is bonus play and does not advance the plan. The picture on the play button shows today’s theme.

## Grown-ups area
On the home screen, press and hold the small faint circle (bottom right) for 1.5 seconds.
- **Progress**: week and month, report card per skill, together moments, monthly check-ins
- **Plan**: every month, week and lesson with what it contains, why, and its together moment
- **Notes**: log good news or worries as they happen, tag the area, attach a photo or drawing
- **Review**: a plain-language summary of progress, skills, automatic adjustments, check-ins and notes, with suggested focus for the next plan. Copy, share or download it
- **Settings**: name, phrase length (follow the plan, or always 2 or 3), voice, speed, recordings, **backup file**, restart plan

Everything is stored on the device only. Use *Download backup* now and then.

## Show-off weeks
Weeks 4 and 8 replay his favourites (the activities he has practised most), and the painting screen pulses the gallery button so he looks at his paintings. The gallery keeps the latest 300 paintings, and screens wait about 45 seconds before moving on by themselves.

## Painting memories
Each finished painting remembers up to three words from the day (the animal he met, a colour, “three eggs”, a feeling), prefers words he found easily or tried to say, and gains little extras (the hen, the egg, a colour dot) so no two paintings look alike.
- **Gallery:** each tile shows small stickers for its words. Tap a painting and Pip reminds him of the words; tap a word to hear it; the 🎙️ plays his own voice if he recorded that day.
- **Remember this one?** Once per lesson, a painting from a few days ago returns with one easy question about a word on it (no reward, no pressure).
- **Grown-ups:** press and hold “grown-ups” in the painting view for a prompt (“What did we paint here?”) and to add a real photo (his own dog, the farm).
- **Gallery book:** Review tab → pick a month → Print → Save as PDF.

## Roadmap
- **Phase 1 (done)**: plan engine, Month 1 activities, spoken questions, grown-ups dashboard, notes and check-ins
- **Phase 2 (done)**: Month 2 content: crow number stories, yes/no, “first, then”, greetings, two-word requests, feelings in stories, two more adventure stories
- **Learning loop (done)**: the app gently adjusts difficulty from how he does (one more or fewer picture to choose from, logged in the grown-ups area), and the Review tab turns progress, notes and check-ins into a summary that shapes the next plan
- **Month 3 (held)**: waiting, sharing, everyday-place stories, counting to 10 with story problems
- **Later**: logins for other families, shared notes and attachments

## Make it personal
- Photos of his own animals: put `dog.jpg`, `cat.jpg`, `hen.jpg`, `hamster.jpg`, `cow.jpg`, `sheep.jpg` in `public/photos/`
- Real animal sounds: put `dog.mp3`, `cat.mp3`, `hen.mp3`… in `public/sounds/`

## Run and deploy
```
npm start        # http://localhost:3000
npm install && npm test
```
`npm test` plays all 48 lessons in a simulated browser and exercises the grown-ups area. Push to GitHub, then on Railway choose **Deploy from GitHub repo**. No variables are needed. The microphone needs HTTPS, which Railway provides. On an iPad, open the link in Safari and use Share → Add to Home Screen.
