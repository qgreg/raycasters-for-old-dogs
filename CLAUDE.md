# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

A WebXR ray caster practice range for the Meta Quest browser, aimed at older
beginners. Ten short lessons teach the controller first and pointing second,
while a live diagnostics board doubles the app as a hardware tester.

Two audiences share one codebase, and both matter:

- **A lesson** — a person in a headset who has never pointed at anything in VR.
- **A test rig** — the controller check and the board report what the hardware
  actually does, so the same screen serves as a diagnostic.

The user-facing story is in [README.md](README.md), which is unusually complete.
Read it before changing behaviour — most "why is it like this?" questions are
answered there, and it must be updated alongside behaviour changes.

## Hard constraints

- **No build step, ever.** The page is plain ES modules loaded straight from
  disk. Do not introduce bundlers, transpilers, TypeScript, JSX, or a runtime
  package fetch. `index.html` loads `./src/app.js` as `type="module"`.
- **No runtime dependencies.** three.js r185 is vendored in `vendor/` under its
  own MIT licence (`vendor/three.LICENSE`). Import it as
  `../vendor/three.module.js`. The only devDependency is Playwright, used by
  the smoke test.
- **Nothing may move the player.** They stand in one spot for the whole
  session. No locomotion, teleport, or camera translation in VR — that is the
  motion-sickness promise the README makes.
- **Deployed as GitHub Pages from `main` / root.** `.nojekyll` keeps the tree
  unfiltered. Any file added must work when served statically over HTTPS.

## Layout

```
index.html            landing page, cover, instructions; loads src/app.js
styles.css            landing-page styling only (nothing in-world)
src/app.js            scene, panels, game state, main loop, entry points
src/pointers.js       the ray caster: XR controllers, XR hands, and the mouse
src/targets.js        Target — the discs you point at
src/lessons.js        the lesson plan (LESSONS, PRAISE, stageOutcome)
src/controllermap.js  the Touch input map and the ControllerCheck state machine
src/controllerview.js the live per-hand controller diagram (canvas drawing)
src/ui3d.js           Panel (canvas-textured plane) and Button3D, plus COLORS
src/diagnostics.js    the live tester board
src/audio.js          WebAudio beeps
assets/               old-dog.svg (favicon/cover) and social-card.png
test/                 unit tests and the headless smoke test
vendor/               three.js r185, MIT
```

`src/app.js` is the only module that owns global state. Everything else is a
class or pure function it wires together.

## Running and testing

```sh
npm start     # python3 -m http.server 8080 — any static server works
npm test      # node test/controllermap.test.js && node test/smoke.js
npm install   # required before `npm test`: the smoke test needs Playwright
```

`test/controllermap.test.js` runs under bare Node with no dependencies and is
fast — run it after any change to `src/controllermap.js` or `src/lessons.js`.
`test/smoke.js` starts its own `python3 -m http.server` on port 8125 and drives
headless Chromium with SwiftShader.

Both suites are hand-rolled: a local `check(label, condition, detail)` prints
`ok`/`FAIL` lines, collects failures, and exits non-zero. **Do not introduce a
test framework** — match the existing shape.

On a flat screen the mouse stands in for a controller (move to aim, click to
shoot, drag to look). That path exists so the whole app can be checked without
a headset, and the smoke test depends on it.

### What cannot be tested automatically

WebXR cannot be driven headlessly here. Real controllers, the trigger, the
thumbstick, and the Meta button need a human in a headset. That is exactly why
the input logic lives in `src/controllermap.js` as pure, gamepad-shaped
functions (`isLive`, `thumbstick`, `labelFor`, `ControllerCheck`) that unit
tests exercise against synthetic gamepads, and why `stageOutcome` in
`src/lessons.js` is a pure function.

**Keep decisions that must be right testable outside a headset.** If you add
logic that decides whether hardware works or whether a lesson may advance,
factor it into a pure function and test it.

## Test seam: `window.__debug`

`src/app.js` exposes read-only getters plus a few controls (`finish()`,
`goto(id)`, `hands(visible)`) for the browser console and the smoke test.
Nothing in the app may depend on it. Extend it when a new behaviour needs
observing from a test.

## Conventions that are load-bearing

**Comments explain *why*, at length.** This codebase documents decisions, not
mechanics — which headset behaviour forced a workaround, which layout was tried
and rejected, what breaks without a guard. Match that density and that voice;
do not strip explanatory comments to tidy up.

**British spelling and plain-English copy.** Player-facing strings are calm,
never scolding, and there is no failure state — a control is confirmed working
or still waiting. Praise lines live in `PRAISE`.

**Biscuit & Espresso palette, chosen for aging eyes.** Warm hues on warm dark;
no pure black, no fluorescent yellow, no pure white, no large bright fields at
arm's length (targets are deep discs with bright rings, not lit discs). The
canvas-side tokens are `COLORS` in `src/ui3d.js`; the same values appear as
hex literals in three.js material calls. Keep them in step.

| Token | Hex |
|---|---|
| espresso (ground) | `#26221E` |
| biscuit | `#F2D479` |
| cream (ink) | `#F5E6C8` |
| amber (accent, beam) | `#E8A33D` |
| muted | `#A79C86` |
| good / warn / bad | `#8FB96A` / `#E8A33D` / `#D97A5A` |

**Nothing is signalled by colour alone.** A hit is a pop, a rising tone, and a
haptic pulse as well as a colour change, so the app works with a red/green
deficit without a special mode. Preserve that when adding feedback.

**Redraw canvas textures only when something changed.** `say()` in `app.js`
diffs the board before repainting; the stats panel throttles to 4 Hz and the
diagnostics board to 5 Hz. Repainting a canvas texture every frame is wasteful
— never do it in the animation loop unconditionally.

**Panels shrink to fit rather than dropping content.** `Panel.write`, `.rows`,
and `.board` all reduce the type size until everything fits. A board that
quietly omits a reading is worse than a small one.

**The hand diagrams are never mirrored.** Both controllers use the same layout;
a large L/R and the button letters tell them apart. Mirroring made each picture
read as the other hand's controller and flipped the stick arrows.

## The parts most likely to bite you

**Lessons run `update()` every frame, including after they finish.** A lesson
calls `ctx.done()` on every frame until the next one starts, so `completeLesson`
guards with a `completing` flag — without it the chord replays ~120 times and
the randomly-picked praise line churns each frame. The smoke test asserts this
directly. Any new "finish" path must stay idempotent.

**The system buttons are invisible to WebXR.** Neither the Meta button nor the
Menu button appears in the xr-standard mapping, so no `gamepad.buttons[]` entry
ever reports them. Lesson 5 verifies Meta by consequence — a session
`visibilitychange`, *or* a session that ends and is re-entered, since some
headsets do that instead. Both count as one "trip away".

**No teaching step may wait on an event the hardware might not produce.**
Every stage of lesson 5 is time-boxed (`META_PATIENCE` 20 s, `MENU_PATIENCE`
9 s) and offers Skip halfway through. `stageOutcome` is pure precisely so a test
can assert that no stage returns `'waiting'` once patience has run out.

**Unfamiliar hardware must report itself.** Any pressed button index outside the
known map is recorded in `ControllerCheck.unmapped` and shown as `other` on the
board, rather than being silently dropped.

**Analog thresholds are deliberate.** Trigger, grip, and each stick axis need
0.6 of travel — a brush must not count. Each of the four stick directions is a
separate check, because a stick that only travels one way is a real fault that a
single push would have hidden.

**Headset-only lessons must degrade on a flat screen.** A lesson with
`needsHeadset: true` announces itself once and jumps the whole run of them
rather than skipping one at a time. The smoke test covers both entering the run
normally and jumping into one directly with `__debug.goto`.

**Dispose what you remove.** `Target.dispose()` frees geometries, materials, and
canvas textures; targets removed from the scene must be disposed.

## Adding a lesson

Lessons are plain objects in the `LESSONS` array in `src/lessons.js`, in play
order. A lesson may implement `start(ctx)`, `update(dt, ctx)`, `onHit(target,
ctx)`, `onMiss(ctx)`, and carries `id`, `title`, `instruction`, `footer`, plus
optional `needsHeadset`, `showHands`, `endless`.

The `ctx` it receives offers:

```
ctx.spawn(radius, { angle, height, label, mover }) -> Target
ctx.clearTargets()   ctx.targets   ctx.stats
ctx.say({ title, instruction, footer })            // partial update; diffed
ctx.done()                                          // must be idempotent
ctx.beginControllerCheck(ids)  ctx.pollControllerCheck()
ctx.controllerCheck  ctx.labelFor  ctx.systemTrips  ctx.unmappedCount
```

Controller-shaped lessons should use the `controllerLesson({ id, n, group, ... })`
helper and a group from `GROUPS` in `src/controllermap.js`. Lesson titles carry
a hard-coded count (`Lesson N of 10`, via `TOTAL`) — update both if the plan
changes, along with the lesson table in the README and the notes in
`index.html`.

## Git workflow

Commits follow a distinct house style, and new commits should match it:

- Subject in the imperative, sentence case, no prefix or ticket tag
  ("Give the Meta button a resolution it cannot miss").
- A wrapped prose body explaining the problem, why the previous behaviour was
  wrong, and what the change trades away — several paragraphs where warranted.
  Bullet lists of touched files are not the style here.

Do not push to `main` directly; work on the branch you were assigned, and open
a pull request only when explicitly asked.
