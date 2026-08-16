/**
 * What is on a Touch controller, and how to tell whether it works.
 *
 * The xr-standard mapping Meta reports for Touch controllers:
 *
 *   buttons[0]  trigger      (analog)
 *   buttons[1]  grip/squeeze (analog)
 *   buttons[2]  unused on Touch (touchpad slot)
 *   buttons[3]  thumbstick click
 *   buttons[4]  A (right) / X (left)   — the LOWER round button
 *   buttons[5]  B (right) / Y (left)   — the UPPER round button
 *   buttons[6]  thumbrest, on profiles that report one
 *   axes[2,3]   thumbstick x,y
 *
 * The Meta button and the Menu button are deliberately absent: the system
 * runtime keeps them, and a page never sees them press. They are checked a
 * different way — see the system-button lesson, which watches the session go
 * blurred and come back.
 *
 * Nothing here assumes the indices are right on a given headset. Any pressed
 * button outside this map is recorded in `unmapped` and shown on the board, so
 * unfamiliar hardware reports itself rather than going silently missing.
 */

/**
 * Each thumbstick direction is checked separately. A stick that only travels
 * one way is a real fault, and a single push in any direction would have hidden
 * it. Sign convention follows the gamepad norm — away from you is negative Y —
 * but the diagram highlights the arrow being asked for and shows a live dot, so
 * a runtime that inverts an axis is immediately visible rather than confusing.
 */
export const CHECKS = [
  {
    id: 'trigger',
    label: 'Trigger',
    index: 0,
    analog: true,
    hint: 'On the front, where your index finger rests. Squeeze it.',
  },
  {
    id: 'grip',
    label: 'Grip',
    index: 1,
    analog: true,
    hint: 'On the inside of the handle, under your middle finger. Squeeze the controller.',
  },
  {
    id: 'stickUp',
    label: 'Stick forward',
    axis: 'y',
    sign: -1,
    arrow: 'up',
    hint: 'Push the little stick away from you.',
  },
  {
    id: 'stickDown',
    label: 'Stick back',
    axis: 'y',
    sign: 1,
    arrow: 'down',
    hint: 'Pull the little stick back toward you.',
  },
  {
    id: 'stickLeft',
    label: 'Stick left',
    axis: 'x',
    sign: -1,
    arrow: 'left',
    hint: 'Push the little stick to the left.',
  },
  {
    id: 'stickRight',
    label: 'Stick right',
    axis: 'x',
    sign: 1,
    arrow: 'right',
    hint: 'Push the little stick to the right.',
  },
  {
    id: 'stickClick',
    label: 'Stick click',
    index: 3,
    hint: 'Press the thumbstick straight down until it clicks.',
  },
  {
    id: 'lower',
    label: 'Lower button',
    index: 4,
    hint: 'The lower of the two round buttons under your thumb.',
  },
  {
    id: 'upper',
    label: 'Upper button',
    index: 5,
    hint: 'The upper of the two round buttons under your thumb.',
  },
];

/** Lesson-sized groups, so the controller is learned a piece at a time. */
export const GROUPS = {
  trigger: ['trigger'],
  grip: ['grip'],
  stick: ['stickUp', 'stickDown', 'stickLeft', 'stickRight', 'stickClick'],
  buttons: ['lower', 'upper'],
};

export const HANDS = ['left', 'right'];

const MAPPED = new Set([0, 1, 2, 3, 4, 5, 6]);
const THRESHOLD = 0.6;

export function checkById(id) {
  return CHECKS.find((check) => check.id === id) || null;
}

/** A is the lower button on the right hand, X on the left. */
export function labelFor(check, handedness) {
  if (check.id === 'lower') return handedness === 'left' ? 'X button' : 'A button';
  if (check.id === 'upper') return handedness === 'left' ? 'Y button' : 'B button';
  return check.label;
}

export function thumbstick(gamepad) {
  const axes = gamepad.axes;
  // Touch reports the stick on axes 2/3; fall back to 0/1 for anything that does not.
  const x = axes.length >= 4 ? axes[2] : (axes[0] ?? 0);
  const y = axes.length >= 4 ? axes[3] : (axes[1] ?? 0);
  return { x: x ?? 0, y: y ?? 0 };
}

/** Is this control being worked right now? Used for the live diagram. */
export function isLive(check, gamepad) {
  if (!gamepad) return false;
  if (check.axis) {
    const { x, y } = thumbstick(gamepad);
    const value = check.axis === 'x' ? x : y;
    return value * check.sign > THRESHOLD;
  }
  const button = gamepad.buttons[check.index];
  if (!button) return false;
  return button.pressed || (check.analog && button.value > THRESHOLD);
}

/**
 * Tracks which controls have been exercised, per hand. There is no failure
 * state and no wrong answer — a control is either confirmed working or still
 * waiting, which is the right shape for both a lesson and a hardware check.
 *
 * `focus` narrows what counts as finished, so one lesson can ask for triggers
 * while the running record of everything confirmed so far is kept intact.
 */
export class ControllerCheck {
  constructor() {
    this.reset();
  }

  reset() {
    this.confirmed = { left: {}, right: {} };
    this.handsSeen = new Set();
    this.unmapped = new Set();
    this.lastConfirmed = null;
    this.focus = null; // null means "everything"
  }

  setFocus(ids) {
    this.focus = ids && ids.length ? [...ids] : null;
  }

  get focused() {
    if (!this.focus) return CHECKS;
    return CHECKS.filter((check) => this.focus.includes(check.id));
  }

  poll(inputSources) {
    let changed = false;
    for (const source of inputSources || []) {
      const pad = source.gamepad;
      const hand = source.handedness;
      if (!pad || (hand !== 'left' && hand !== 'right')) continue;

      this.handsSeen.add(hand);
      const record = this.confirmed[hand];

      for (const check of CHECKS) {
        if (record[check.id]) continue;
        if (isLive(check, pad)) {
          record[check.id] = true;
          this.lastConfirmed = { hand, check };
          changed = true;
        }
      }

      pad.buttons.forEach((button, index) => {
        if (button.pressed && !MAPPED.has(index)) this.unmapped.add(index);
      });
    }
    return changed;
  }

  isDone(hand, check) {
    return !!this.confirmed[hand]?.[check.id];
  }

  remaining(hand) {
    return this.focused.filter((check) => !this.isDone(hand, check));
  }

  /**
   * The next thing worth asking for. Alternates hands so both controllers are
   * exercised together rather than one being finished and then forgotten.
   */
  next() {
    for (const check of this.focused) {
      for (const hand of ['right', 'left']) {
        if (!this.handsSeen.has(hand)) continue;
        if (!this.isDone(hand, check)) return { hand, check };
      }
    }
    return null;
  }

  /** What the diagram should highlight on a given hand, if anything. */
  wantedFor(hand) {
    const next = this.next();
    return next && next.hand === hand ? next.check : null;
  }

  get complete() {
    return this.handsSeen.size > 0 && this.next() === null;
  }

  get counts() {
    const perHand = this.focused.length;
    let done = 0;
    let total = 0;
    for (const hand of this.handsSeen) {
      total += perHand;
      done += perHand - this.remaining(hand).length;
    }
    return { done, total };
  }
}
