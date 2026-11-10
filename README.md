# Ozzy’s Farm Studio

A calm, painting-themed play session for Ozzy (about 15 minutes). Everything he does adds colour to a farm painting, which is saved to a gallery at the end.

## A session
1. **Hello** with Pip the dog (optional: say it)
2. **Two activities**, rotating each day: colour splash, animal sounds, word pictures (farm, beach, food), pebble/egg/shell counting, rope climbing
3. **Three short phrases** (2 words by default, 3 words in the grown-ups area)
4. **Finished painting** saved to the gallery

Rules: tapping only, 2–3 big pictures per screen, wrong taps just wobble, the right answer glows after a while, and the microphone is always optional. Any sound counts. His recordings are played back louder so a soft voice is heard.

## Grown-ups area
On the home screen, press and hold the small faint circle (bottom right) for 1.5 seconds. Settings: name, phrase length (2 or 3 words), voice and speed, sound effects. You can also play back or delete his recordings (useful to show his speech therapist).

## Make it personal
- Photos of his own animals: put `dog.jpg`, `cat.jpg`, `hen.jpg`, `hamster.jpg`, `cow.jpg`, `sheep.jpg` in `public/photos/`
- Real animal sounds: put `dog.mp3`, `cat.mp3`, `hen.mp3`… in `public/sounds/`

## Run and deploy
```
npm start        # http://localhost:3000
npm install && npm test
```
Push to GitHub, then on Railway choose **Deploy from GitHub repo**. No variables are needed. The microphone needs HTTPS, which Railway provides. On an iPad, open the link in Safari and use Share → Add to Home Screen for full screen.

Progress and recordings are stored on the device (not uploaded).
