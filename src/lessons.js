import { GROUPS } from './controllermap.js';

// The lesson plan. Each step is deliberately small, and nothing ever moves the
// player — you stand in one place the whole way through.
//
// The controller comes first and targeting comes second. Both hands are learned
// together throughout: every control is asked for on the left and the right, so
// a dead button on one controller surfaces as the one thing that never ticks.
//
// A lesson gets a `ctx` with:
//   ctx.spawn(radius, {angle, height, label, mover})  -> Target
//   ctx.clearTargets()   ctx.targets   ctx.say({...})
//   ctx.done()           ctx.stats
//   ctx.beginControllerCheck(ids)  ctx.pollControllerCheck()
//   ctx.controllerCheck  ctx.labelFor  ctx.systemTrips
// and may implement start / update / onHit / onMiss.

const HOLD_MS = 1200;
const TOTAL = 10;

// How long the system-button lesson waits before moving on by itself.
export const META_PATIENCE = 20000;
export const MENU_PATIENCE = 9000;

/**
 * How a system-button stage should resolve. Pressing Meta may blur the session,
 * end it, or — depending on the headset — produce nothing a web page can see.
 * The lesson must finish in every one of those cases, so this never returns
 * 'waiting' once the patience has run out.
 */
export function stageOutcome({ reached, waited, patience }) {
  if (reached) return 'reached';
  if (waited >= patience) return 'timeout';
  return 'waiting';
}

/**
 * The controller lessons share a shape: ask for one control at a time, on
 * alternating hands, and finish when every control in the group is confirmed on
 * every controller present. The picture beside the player does the explaining —
 * the control being asked for pulses, and turns green once it has worked.
 */
function controllerLesson({ id, n, group, instruction, footer = '' }) {
  return {
    id,
    title: `Lesson ${n} of ${TOTAL}`,
    instruction,
    footer,
    needsHeadset: true,
    showHands: true,
    start(ctx) {
      ctx.beginControllerCheck(GROUPS[group]);
    },
    update(dt, ctx) {
      const check = ctx.controllerCheck;
      if (!check) return;
      ctx.pollControllerCheck();

      if (check.complete) return ctx.done();

      if (!check.handsSeen.size) {
        ctx.say({
          instruction: 'Pick up a controller and press anything on it.',
          footer: 'Waking one up can take a moment.',
        });
        return;
      }

      const next = check.next();
      if (!next) return;
      const { done, total } = check.counts;
      ctx.say({
        instruction: `${next.hand === 'left' ? 'Left' : 'Right'} hand: ${ctx.labelFor(next.check, next.hand)}.\n${next.check.hint}`,
        footer: `${done} of ${total} — the glowing part of the picture is the one to try`,
      });
    },
    // Pointing at things is welcome during these; it just does not advance them.
    onMiss() {},
  };
}

export const LESSONS = [
  controllerLesson({
    id: 'ctrl-trigger',
    n: 1,
    group: 'trigger',
    instruction: 'A picture of each controller is beside you.\nStart with the trigger, on both hands.',
    footer: 'One hand, then the other.',
  }),

  controllerLesson({
    id: 'ctrl-grip',
    n: 2,
    group: 'grip',
    instruction: 'Now the grip button, on both hands.\nIt is on the inside of the handle.',
    footer: 'Just squeeze the controller as if holding a torch.',
  }),

  controllerLesson({
    id: 'ctrl-stick',
    n: 3,
    group: 'stick',
    instruction: 'The little stick, in all four directions,\nand then a press straight down.',
    footer: 'Ten in all — five on each hand.',
  }),

  controllerLesson({
    id: 'ctrl-buttons',
    n: 4,
    group: 'buttons',
    instruction: 'Last of the controller: the round buttons.\nA and B on the right, X and Y on the left.',
    footer: '',
  }),

  {
    id: 'system',
    title: `Lesson 5 of ${TOTAL}`,
    instruction: 'Two buttons are left, one on each controller.\nThey belong to the headset rather than to this page.',
    footer: '',
    needsHeadset: true,
    showHands: true,
    start(ctx) {
      this.stage = 0;
      this.trips = ctx.systemTrips;
      this.unmapped = ctx.unmappedCount;
      this.stageStarted = performance.now();
      this.settledAt = 0;
      this.nudged = false;
      ctx.say({
        instruction: 'On your RIGHT controller, below the round buttons,\npress the Meta button.',
        footer: 'Everything here will vanish. That is meant to happen.',
      });
    },
    update(dt, ctx) {
      const waited = performance.now() - this.stageStarted;
      const reached = ctx.systemTrips > this.trips || ctx.unmappedCount > this.unmapped;

      // Stage one: the Meta button. It may blur the session, or end it and drop
      // the player back to the page — both are counted as a trip. It may also
      // do neither, so the stage resolves on its own rather than waiting for an
      // event that might never arrive.
      if (this.stage === 0) {
        const outcome = stageOutcome({ reached, waited, patience: META_PATIENCE });
        if (outcome === 'waiting') {
          // Halfway through the wait, say how to move on without it.
          if (!this.nudged && waited > META_PATIENCE / 2) {
            this.nudged = true;
            ctx.say({ footer: 'No hurry. If nothing happens, point at Skip below and carry on.' });
          }
          return;
        }

        this.stage = 1;
        this.trips = ctx.systemTrips;
        this.unmapped = ctx.unmappedCount;
        this.stageStarted = performance.now();
        this.nudged = false;
        ctx.say(outcome === 'reached'
          ? {
              instruction: 'And there you are again.\nThat is how you get back from anywhere.\n\nNow the LEFT controller: the button marked with three little lines.',
              footer: 'Press it and watch what happens — either answer is a fine one.',
            }
          : {
              instruction: 'We did not see that one happen, which is quite all right.\n\nNow the LEFT controller: the button marked with three little lines.',
              footer: 'Press it and watch what happens — either answer is a fine one.',
            });
        return;
      }

      // Stage two: the Menu button. Whether a web page can see it at all
      // depends on the headset, so this measures rather than assumes.
      const outcome = stageOutcome({ reached, waited, patience: MENU_PATIENCE });
      if (outcome === 'waiting') return;

      if (!this.settledAt) {
        this.settledAt = performance.now();
        ctx.say(outcome === 'reached'
          ? {
              instruction: 'That one reached us.\nNow you know where both of them are.',
              footer: 'Noted on the board as well.',
            }
          : {
              instruction: 'Nothing reached us from that one — which is the usual answer.\nThe headset keeps it for itself.',
              footer: 'It is still worth knowing where it is, so it never surprises you.',
            });
      }
      if (performance.now() - this.settledAt > 3400) ctx.done();
    },
    onMiss() {},
  },

  {
    id: 'aim',
    title: `Lesson 6 of ${TOTAL}`,
    instruction: 'Now for pointing. A beam comes out of each hand.\nHold the dot on the circle.',
    footer: 'No buttons this time — just aim.',
    start(ctx) {
      ctx.spawn(0.34, { angle: 0, height: 1.45 });
    },
    // Squeezing the trigger early is not a mistake — take the win and move on.
    onHit(target, ctx) {
      ctx.done();
    },
    update(dt, ctx) {
      const target = ctx.targets[0];
      if (!target || target.dead) return;
      if (target.hoverHeld > HOLD_MS) {
        target.hit();
        ctx.done();
      } else if (target.hovered) {
        const left = Math.ceil((HOLD_MS - target.hoverHeld) / 1000);
        ctx.say({ instruction: 'That is it. Keep it steady…', footer: `${left}` });
      } else {
        ctx.say({ instruction: this.instruction, footer: this.footer });
      }
    },
  },

  {
    id: 'trigger',
    title: `Lesson 7 of ${TOTAL}`,
    instruction: 'Aim at the circle, then squeeze the trigger —\nthe one you already know.',
    footer: 'Three of them. Take your time.',
    remaining: 3,
    start(ctx) {
      this.remaining = 3;
      ctx.spawn(0.32, { angle: 0, height: 1.45 });
    },
    onHit(target, ctx) {
      this.remaining--;
      if (this.remaining <= 0) return ctx.done();
      const angle = [-18, 18, 0][this.remaining % 3];
      ctx.spawn(0.32, { angle, height: 1.45 });
      ctx.say({ footer: `${this.remaining} to go` });
    },
    onMiss(ctx) {
      ctx.say({ footer: 'Missed — put the dot on the circle first, then squeeze.' });
    },
  },

  {
    id: 'sweep',
    title: `Lesson 8 of ${TOTAL}`,
    instruction: 'Same again, but they move around.\nSwing your whole arm to follow.',
    footer: '',
    spots: [[-34, 1.7], [30, 1.25], [-22, 1.2], [38, 1.72], [0, 1.82]],
    index: 0,
    start(ctx) {
      this.index = 0;
      this._next(ctx);
    },
    onHit(target, ctx) {
      this.index++;
      if (this.index >= this.spots.length) return ctx.done();
      this._next(ctx);
    },
    _next(ctx) {
      const [angle, height] = this.spots[this.index];
      ctx.spawn(0.26, { angle, height });
      ctx.say({ footer: `${this.spots.length - this.index} to go` });
    },
  },

  {
    id: 'small',
    title: `Lesson 9 of ${TOTAL}`,
    instruction: 'Smaller ones now.\nSteady hand, then squeeze.',
    footer: '',
    remaining: 6,
    start(ctx) {
      this.remaining = 6;
      this._next(ctx);
    },
    onHit(target, ctx) {
      this.remaining--;
      if (this.remaining <= 0) return ctx.done();
      this._next(ctx);
    },
    _next(ctx) {
      const angle = -35 + Math.random() * 70;
      const height = 1.2 + Math.random() * 0.62;
      ctx.spawn(0.14, { angle, height });
      ctx.say({ footer: `${this.remaining} to go` });
    },
  },

  {
    id: 'moving',
    title: `Lesson 10 of ${TOTAL}`,
    instruction: 'Last one. These drift.\nLead them a little with the beam.',
    footer: '',
    remaining: 4,
    start(ctx) {
      this.remaining = 4;
      this._next(ctx);
    },
    onHit(target, ctx) {
      this.remaining--;
      if (this.remaining <= 0) return ctx.done();
      this._next(ctx);
    },
    _next(ctx) {
      const speed = 12 + Math.random() * 10;
      const centre = -12 + Math.random() * 24;
      const span = 22;
      ctx.spawn(0.2, {
        angle: centre,
        height: 1.25 + Math.random() * 0.5,
        mover: (t) => ({ angle: centre + Math.sin(t * (speed / 20)) * span }),
      });
      ctx.say({ footer: `${this.remaining} to go` });
    },
  },

  {
    id: 'range',
    title: 'Free practice',
    instruction: 'Practice as long as you like.\nThey keep coming.',
    footer: 'Press Finish when you have had enough.',
    endless: true,
    start(ctx) {
      for (let i = 0; i < 3; i++) this._spawn(ctx);
    },
    onHit(target, ctx) {
      this._spawn(ctx);
    },
    _spawn(ctx) {
      const radius = 0.12 + Math.random() * 0.16;
      const angle = -40 + Math.random() * 80;
      const height = 1.2 + Math.random() * 0.62;
      const drifts = Math.random() < 0.35;
      ctx.spawn(radius, {
        angle,
        height,
        mover: drifts ? (t) => ({ angle: angle + Math.sin(t * 0.6) * 16 }) : null,
      });
    },
  },
];

export const PRAISE = [
  'Nicely done.',
  'That is exactly right.',
  'You have got it.',
  'Good aim.',
  'Better every time.',
];
