# Raycasters for Old Doggies

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

## Look and feel

Styled as an affectionate nod to the plain-English reference paperback — a
yellow-and-dark cover, margin markers, an explicitly-skippable sidebar. The
resemblance stops at the genre: no borrowed wordmark, tagline, or mascot. The
dog is ours, assembled out of triangles, and the palette is deliberately not
theirs.

**Biscuit & Espresso** warms both ends of the yellow-and-black idea: no pure
black, no fluorescent yellow, no pure white.

| Token | Hex | On espresso |
|---|---|---|
| espresso (ground) | `#26221E` | — |
| biscuit (the yellow) | `#F2D479` | 10.9:1 |
| cream (body text) | `#F5E6C8` | 12.8:1 |
| amber (accents, the beam) | `#E8A33D` | 7.3:1 |
| muted (secondary) | `#A79C86` | 5.8:1 |

The choice is not only taste. An aging lens yellows and scatters light, so blues
arrive dimmed while warm hues arrive at close to full strength; contrast
sensitivity drops, so the ratios stay high; and glare recovery slows, so there
are no large bright fields inside the headset — the targets are deep honey
discs with bright rings rather than lit discs, and text is warm-bright on
warm-dark rather than the reverse.

Nothing is signalled by colour alone. A hit is a pop, a rising tone, and a
haptic pulse as well as a colour change, so the app works for a red/green
deficit without any special mode.

## The lessons

| # | Lesson | What it teaches |
|---|--------|-----------------|
| 1 | Aim | The beam comes out of your *hand*. Hold the dot on the circle — no buttons. |
| 2 | Squeeze | Aim, then pull the trigger. Three large targets. |
| 3 | Sweep | Targets appear across the arc; move your arm, not just your wrist. |
| 4 | Smaller | Same again, at a size that needs a steady hand. |
| 5 | Movers | Drifting targets, so aim has to track. |
| 6 | The whole controller | Every control on both controllers, ticked off as it is pressed. |
| 7 | The way out | The system buttons, and how to come back from them. |
| — | Free practice | Endless targets of mixed size and drift. |

### Lesson 6, the controller check

Walks the full input surface a hand at a time — trigger, grip, thumbstick,
thumbstick click, and the two round buttons (A/B on the right, X/Y on the left)
— suggesting the next unconfirmed one and ticking each off as it registers.
There is no failure state: a control is either confirmed working or still
waiting, which makes the same screen serve as a lesson and as a hardware check.
Asking for both controllers means a dead button shows up as the one box that
never ticks.

Analog controls need a firm press, not a brush: trigger and grip must exceed
0.6, and the thumbstick must be pushed past 0.65 of its travel.

### Lesson 7, the system buttons

**The Meta button and the Menu button cannot be read by a web page.** They are
reserved by the runtime, and no `gamepad.buttons[]` entry ever reports them.

They are verified by consequence instead. Pressing Meta blurs the immersive
session, so `XRSession.visibilityState` leaves `visible` and a
`visibilitychange` event fires; coming back flips it home. The lesson counts
that round trip — shown as **trips away** on the board — and uses it to teach
the thing beginners most need: everything vanishing is not a mistake, and the
same button brings it all back.

Three buttons float below the range: **Repeat**, **Skip** (**Finish** during
free practice), and **Board** to hide or show the diagnostics panel. They are
pointed at and clicked the same way as the targets, which is the point.

## The diagnostics board

The right-hand panel is the tester half. It reads, live:

- frame rate, WebXR support, session mode, reference space type, headset refresh rate
- per input source: the controller layout as the headset names it, target ray mode, hand-tracking flag
- trigger and grip analog values as meters, and thumbstick axes
- every button the runtime reports, named where the name is known and numbered
  where it is not, marked `!` pressed and `~` touched — so a controller with an
  unfamiliar arrangement reports itself instead of going silently missing
- the system-button trip counter
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

Two suites run:

`test/controllermap.test.js` unit-tests the controller check against synthetic
gamepads — button naming per hand, the analog thresholds, axis fallback, one
control at a time being suggested, a second controller reopening the check, and
unfamiliar hardware being recorded rather than dropped. A headless browser
cannot squeeze a real trigger, so this is where that logic is actually proven.

`test/smoke.js` drives the flat-screen path in headless Chromium: the page
loads clean, lessons advance, the ray hits what it is aimed at, hits and misses
score correctly, and the two headset-only lessons announce themselves and step
aside instead of dead-ending.

WebXR itself cannot be driven headlessly, so the immersive path — the real
controllers, the real Meta button — still needs a human in a headset.

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
src/controllermap.js  the Touch input map and the controller check
src/ui3d.js         canvas-textured panels and 3D buttons
src/diagnostics.js  the live tester board
src/audio.js        WebAudio beeps
vendor/             three.js r185, MIT
```

`window.__debug` exposes the running state (current lesson, score, what the
ray is on) for poking at from the browser console.
