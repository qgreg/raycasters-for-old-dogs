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
    id: 'stick',
    label: 'Thumbstick',
    axes: true,
    hint: 'The little stick under your thumb. Push it around in a circle.',
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

const MAPPED = new Set([0, 1, 2, 3, 4, 5, 6]);

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

/**
 * Tracks which controls have been exercised, per hand. There is no failure
 * state and no wrong answer — a control is either confirmed working or still
 * waiting, which is the right shape for both a lesson and a hardware check.
 */
export class ControllerCheck {
  constructor() {
    this.reset();
  }

  reset() {
    this.confirmed = { left: {}, right: {} };
    this.handsSeen = new Set();
    this.unmapped = new Set();
    this.lastConfirmed = null; // {hand, check} — for the "that one worked" beat
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

        let fired = false;
        if (check.axes) {
          const { x, y } = thumbstick(pad);
          fired = Math.hypot(x, y) > 0.65;
        } else {
          const button = pad.buttons[check.index];
          fired = !!button && (button.pressed || (check.analog && button.value > 0.6));
        }

        if (fired) {
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
    return CHECKS.filter((check) => !this.isDone(hand, check));
  }

  /** The next thing worth asking for, or null when everything seen is confirmed. */
  next() {
    for (const hand of ['right', 'left']) {
      if (!this.handsSeen.has(hand)) continue;
      const [check] = this.remaining(hand);
      if (check) return { hand, check };
    }
    return null;
  }

  get complete() {
    return this.handsSeen.size > 0 && this.next() === null;
  }

  get counts() {
    let done = 0;
    let total = 0;
    for (const hand of this.handsSeen) {
      total += CHECKS.length;
      done += CHECKS.length - this.remaining(hand).length;
    }
    return { done, total };
  }
}
