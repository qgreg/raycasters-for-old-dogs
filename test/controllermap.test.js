/**
 * Unit tests for the controller check.
 *
 * A headless browser cannot squeeze a real trigger or push a real thumbstick,
 * so the logic that decides "this control has been proven to work" is tested
 * here against synthetic gamepads instead. This is the part that has to be
 * right for a hardware check to mean anything.
 */
import { ControllerCheck, CHECKS, GROUPS, checkById, labelFor, thumbstick, isLive } from '../src/controllermap.js';
import { stageOutcome, META_PATIENCE, MENU_PATIENCE } from '../src/lessons.js';

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

const stick = (x, y) => gamepad({ axes: [0, 0, x, y] });
const source = (handedness, pad) => ({ handedness, gamepad: pad, profiles: ['meta-quest-touch-plus'] });
const ALL = CHECKS.map((c) => c.id);

// --- naming ------------------------------------------------------------------

check('lower button is A on the right', labelFor(checkById('lower'), 'right') === 'A button');
check('lower button is X on the left', labelFor(checkById('lower'), 'left') === 'X button');
check('upper button is B on the right', labelFor(checkById('upper'), 'right') === 'B button');
check('upper button is Y on the left', labelFor(checkById('upper'), 'left') === 'Y button');

// --- thumbstick axes ---------------------------------------------------------

check('stick reads axes 2 and 3 on Touch',
  (() => { const { x, y } = thumbstick(gamepad({ axes: [0.9, 0.9, -0.5, 0.25] })); return x === -0.5 && y === 0.25; })());
check('stick falls back to axes 0 and 1',
  (() => { const { x, y } = thumbstick({ axes: [0.3, -0.7] }); return x === 0.3 && y === -0.7; })());

// --- each stick direction is its own control ---------------------------------

check('four stick directions are checked separately',
  GROUPS.stick.filter((id) => id.startsWith('stick') && id !== 'stickClick').length === 4);

check('pushing forward fires only forward',
  isLive(checkById('stickUp'), stick(0, -0.9)) &&
  !isLive(checkById('stickDown'), stick(0, -0.9)) &&
  !isLive(checkById('stickLeft'), stick(0, -0.9)) &&
  !isLive(checkById('stickRight'), stick(0, -0.9)));

check('pulling back fires only back', isLive(checkById('stickDown'), stick(0, 0.9)) && !isLive(checkById('stickUp'), stick(0, 0.9)));
check('left fires only left', isLive(checkById('stickLeft'), stick(-0.9, 0)) && !isLive(checkById('stickRight'), stick(-0.9, 0)));
check('right fires only right', isLive(checkById('stickRight'), stick(0.9, 0)) && !isLive(checkById('stickLeft'), stick(0.9, 0)));
check('a diagonal counts for both of its directions',
  isLive(checkById('stickUp'), stick(0.8, -0.8)) && isLive(checkById('stickRight'), stick(0.8, -0.8)));
check('a light nudge counts for nothing', !isLive(checkById('stickRight'), stick(0.3, 0)));

{
  // The whole point of splitting the directions: a stick that only travels one
  // way must not pass.
  const c = new ControllerCheck();
  c.setFocus(GROUPS.stick);
  for (let i = 0; i < 5; i++) c.poll([source('right', stick(0, -1))]);
  check('a stick stuck on one axis does not complete the group', !c.complete);
  check('and the missing direction is what is asked for next',
    ['stickDown', 'stickLeft', 'stickRight'].includes(c.next()?.check.id), c.next()?.check.id);
}

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
  c.poll([source('right', gamepad({ buttons: { 0: { value: 0.4 } } }))]);
  check('a half-squeezed trigger does not count', !c.isDone('right', checkById('trigger')));
  c.poll([source('right', gamepad({ buttons: { 0: { value: 0.85 } } }))]);
  check('a firm squeeze counts', c.isDone('right', checkById('trigger')));
}

// --- focus, so one lesson asks for one group ---------------------------------

{
  const c = new ControllerCheck();
  c.setFocus(GROUPS.trigger);
  c.poll([source('right', gamepad()), source('left', gamepad())]);
  check('a focused group counts only its own controls', c.counts.total === 2, `total=${c.counts.total}`);

  c.poll([source('right', gamepad({ buttons: { 0: { value: 1 } } }))]);
  check('one hand done does not finish the group', !c.complete);
  check('the other hand is asked for next', c.next()?.hand === 'left');

  c.poll([source('left', gamepad({ buttons: { 0: { value: 1 } } }))]);
  check('both hands done finishes the group', c.complete);

  // Widening the focus reopens work without losing what was already proven.
  c.setFocus(GROUPS.grip);
  check('switching group reopens the check', !c.complete);
  check('and the earlier triggers stay confirmed', c.isDone('right', checkById('trigger')) && c.isDone('left', checkById('trigger')));
}

{
  const c = new ControllerCheck();
  c.setFocus(ALL);
  c.poll([source('right', gamepad()), source('left', gamepad())]);
  check('both hands are tracked at once', c.counts.total === CHECKS.length * 2);

  // Alternating hands means neither controller gets finished and forgotten.
  const first = c.next();
  c.confirmed[first.hand][first.check.id] = true;
  const second = c.next();
  check('the same control is asked of the other hand next',
    second.check.id === first.check.id && second.hand !== first.hand);
}

{
  const c = new ControllerCheck();
  c.poll([source('right', gamepad())]);
  const asked = [];
  for (let i = 0; i < CHECKS.length; i++) {
    const next = c.next();
    asked.push(next.check.id);
    c.confirmed[next.hand][next.check.id] = true;
  }
  check('suggests each control exactly once', new Set(asked).size === CHECKS.length);
  check('and stops suggesting when done', c.next() === null);
}

// --- what the diagram highlights ---------------------------------------------

{
  const c = new ControllerCheck();
  c.setFocus(GROUPS.trigger);
  c.poll([source('right', gamepad()), source('left', gamepad())]);
  const wanted = c.next();
  check('the diagram highlights only the hand being asked',
    c.wantedFor(wanted.hand)?.id === 'trigger' && c.wantedFor(wanted.hand === 'left' ? 'right' : 'left') === null);
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
  check('a missing gamepad is never "live"', !isLive(checkById('trigger'), null));
}

// --- the system-button lesson always resolves ---------------------------------
// Pressing Meta may blur the session, end it outright, or do nothing a web page
// can see. The lesson has to finish in every one of those cases — a stage that
// waits forever strands the player with no way forward.

check('a detected trip resolves at once',
  stageOutcome({ reached: true, waited: 0, patience: META_PATIENCE }) === 'reached');
check('an undetected press still resolves once patience runs out',
  stageOutcome({ reached: false, waited: META_PATIENCE, patience: META_PATIENCE }) === 'timeout');
check('and it waits until then',
  stageOutcome({ reached: false, waited: META_PATIENCE - 1, patience: META_PATIENCE }) === 'waiting');
check('the menu stage resolves on its own too',
  stageOutcome({ reached: false, waited: MENU_PATIENCE, patience: MENU_PATIENCE }) === 'timeout');
check('no stage can wait forever',
  [META_PATIENCE, MENU_PATIENCE].every((patience) =>
    stageOutcome({ reached: false, waited: patience + 1, patience }) !== 'waiting'));
check('a trip beats the clock even at zero patience',
  stageOutcome({ reached: true, waited: 0, patience: 0 }) === 'reached');

console.log(failures.length ? `\n${failures.length} failing check(s)` : '\nall controller checks passed');
process.exit(failures.length ? 1 : 0);
