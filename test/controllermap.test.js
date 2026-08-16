/**
 * Unit tests for the controller check.
 *
 * A headless browser cannot squeeze a real trigger, so the logic that decides
 * "this control has been proven to work" is tested here against synthetic
 * gamepads instead. This is the part that has to be right for a hardware check
 * to mean anything.
 */
import { ControllerCheck, CHECKS, labelFor, thumbstick } from '../src/controllermap.js';

const failures = [];
function check(label, condition, detail = '') {
  const ok = !!condition;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

/** A Touch-shaped gamepad with everything at rest. */
function gamepad({ buttons = {}, axes = [0, 0, 0, 0] } = {}) {
  return {
    buttons: Array.from({ length: 7 }, (_, i) => ({
      pressed: buttons[i]?.pressed ?? false,
      touched: buttons[i]?.touched ?? false,
      value: buttons[i]?.value ?? 0,
    })),
    axes,
  };
}

const source = (handedness, pad) => ({ handedness, gamepad: pad, profiles: ['meta-quest-touch-plus'] });

// --- naming ------------------------------------------------------------------

const lower = CHECKS.find((c) => c.id === 'lower');
const upper = CHECKS.find((c) => c.id === 'upper');
check('lower button is A on the right', labelFor(lower, 'right') === 'A button');
check('lower button is X on the left', labelFor(lower, 'left') === 'X button');
check('upper button is B on the right', labelFor(upper, 'right') === 'B button');
check('upper button is Y on the left', labelFor(upper, 'left') === 'Y button');

// --- thumbstick axes ---------------------------------------------------------

check('stick reads axes 2 and 3 on Touch',
  (() => { const { x, y } = thumbstick(gamepad({ axes: [0.9, 0.9, -0.5, 0.25] })); return x === -0.5 && y === 0.25; })());
check('stick falls back to axes 0 and 1',
  (() => { const { x, y } = thumbstick({ axes: [0.3, -0.7] }); return x === 0.3 && y === -0.7; })());

// --- confirming controls -----------------------------------------------------

{
  const c = new ControllerCheck();
  c.poll([source('right', gamepad())]);
  check('resting controller confirms nothing', c.counts.done === 0);
  check('but the hand is noticed', c.handsSeen.has('right'));
  check('and it is not complete', !c.complete);
}

{
  const c = new ControllerCheck();
  // An analog trigger held halfway should not count as a press.
  c.poll([source('right', gamepad({ buttons: { 0: { value: 0.4 } } }))]);
  check('a half-squeezed trigger does not count', !c.isDone('right', CHECKS[0]));
  c.poll([source('right', gamepad({ buttons: { 0: { value: 0.85 } } }))]);
  check('a firm squeeze counts', c.isDone('right', CHECKS[0]));
}

{
  const c = new ControllerCheck();
  c.poll([source('right', gamepad({ axes: [0, 0, 0.2, 0.1] }))]);
  check('a nudged thumbstick does not count', !c.isDone('right', CHECKS[2]));
  c.poll([source('right', gamepad({ axes: [0, 0, 0.8, 0.2] }))]);
  check('a pushed thumbstick counts', c.isDone('right', CHECKS[2]));
}

{
  const c = new ControllerCheck();
  const press = (hand, index) => c.poll([source(hand, gamepad({ buttons: { [index]: { pressed: true } } }))]);
  // Exercise everything on the right hand only.
  c.poll([source('right', gamepad({ buttons: { 0: { value: 1 } } }))]);
  c.poll([source('right', gamepad({ buttons: { 1: { value: 1 } } }))]);
  c.poll([source('right', gamepad({ axes: [0, 0, 1, 0] }))]);
  press('right', 3);
  press('right', 4);
  press('right', 5);
  check('every right-hand control confirmed', c.counts.done === CHECKS.length, `${c.counts.done}/${CHECKS.length}`);
  check('one confirmed controller completes the check', c.complete);

  // A second controller appearing reopens the check for that hand.
  c.poll([source('left', gamepad())]);
  check('a newly seen left hand reopens it', !c.complete);
  check('and it is suggested next', c.next()?.hand === 'left');
}

{
  const c = new ControllerCheck();
  c.poll([source('right', gamepad())]);
  const suggestions = [];
  for (let i = 0; i < CHECKS.length; i++) {
    const next = c.next();
    suggestions.push(next.check.id);
    // Confirm whatever was asked for, so the next call moves on.
    c.confirmed[next.hand][next.check.id] = true;
  }
  check('suggests each control exactly once', new Set(suggestions).size === CHECKS.length);
  check('and stops suggesting when done', c.next() === null);
}

// --- unfamiliar hardware -----------------------------------------------------

{
  const c = new ControllerCheck();
  const pad = gamepad();
  pad.buttons.push({ pressed: true, touched: true, value: 1 }); // an index we do not map
  c.poll([source('right', pad)]);
  check('an unmapped button is recorded, not dropped', c.unmapped.has(7));
}

{
  const c = new ControllerCheck();
  // Hand tracking reports no gamepad at all — it must not throw or be counted.
  c.poll([{ handedness: 'right', profiles: ['generic-hand-select'] }]);
  check('a gamepad-less input source is ignored safely', c.handsSeen.size === 0);
}

console.log(failures.length ? `\n${failures.length} failing check(s)` : '\nall controller checks passed');
process.exit(failures.length ? 1 : 0);
