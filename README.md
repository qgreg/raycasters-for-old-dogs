# Raycasters for Old Dogs

A WebXR ray caster practice range for the Meta Quest browser. It teaches one
thing — *point the beam, squeeze the trigger* — and shows a live diagnostics
board while it does, so it doubles as a ray caster tester for a headset.

No build step, no dependencies to fetch at runtime. Open the page, press start.

## Using it in a Quest

1. Open the **Browser** app in the headset.
2. Go to the page.
3. Press **Put on the headset & start** and accept the permission prompt.

The whole session happens standing in one spot. Nothing moves the player, so
there is nothing in here that causes motion sickness.

Controllers or hand tracking both work. WebXR gives tracked hands a target ray
of their own, so pinching thumb-to-index behaves exactly like a trigger pull.

## The lessons

| # | Lesson | What it teaches |
|---|--------|-----------------|
| 1 | Aim | The beam comes out of your *hand*. Hold the dot on the circle — no buttons. |
| 2 | Squeeze | Aim, then pull the trigger. Three large targets. |
| 3 | Sweep | Targets appear across the arc; move your arm, not just your wrist. |
| 4 | Smaller | Same again, at a size that needs a steady hand. |
| 5 | Movers | Drifting targets, so aim has to track. |
| — | Free practice | Endless targets of mixed size and drift. |

Three buttons float below the range: **Repeat**, **Skip** (**Finish** during
free practice), and **Board** to hide or show the diagnostics panel. They are
pointed at and clicked the same way as the targets, which is the point.

## The diagnostics board

The right-hand panel is the tester half. It reads, live:

- frame rate, WebXR support, session mode, reference space type, headset refresh rate
- per input source: handedness, target ray mode, hardware profile, hand-tracking flag
- trigger and grip analog values as meters, thumbstick axes, and which buttons are down
- the ray's world direction and what it currently hits, with distance

Useful for confirming a headset, a controller, or a pairing is behaving before
blaming the person holding it.

## Running it locally

Any static file server works — the page is plain ES modules and a vendored
copy of three.js.

```sh
npm start           # python3 -m http.server 8080
# then open http://localhost:8080
```

On a flat screen the mouse stands in for a controller: move to aim, click to
shoot, drag to look around. That mode exists so the whole thing can be checked
without putting a headset on.

## Tests

```sh
npm install
npm test
```

`test/smoke.js` drives the flat-screen path in headless Chromium: the page
loads clean, lessons advance, the ray hits what it is aimed at, hits and misses
score correctly. WebXR itself cannot be driven headlessly, so the immersive
path still needs a human in a headset.

## Publishing to GitHub Pages

Settings → Pages → Deploy from branch → `main` / root. The repo has a
`.nojekyll` file so nothing gets filtered. WebXR requires HTTPS, which Pages
provides; `localhost` is also treated as secure for local testing.

## Layout

```
index.html          landing page and instructions
styles.css          landing page styling
src/app.js          scene, panels, game state, entry points
src/pointers.js     the ray caster: controllers, hands, and mouse
src/targets.js      the targets
src/lessons.js      the lesson plan
src/ui3d.js         canvas-textured panels and 3D buttons
src/diagnostics.js  the live tester board
src/audio.js        WebAudio beeps
vendor/             three.js r185, MIT
```

`window.__debug` exposes the running state (current lesson, score, what the
ray is on) for poking at from the browser console.
