// The lesson plan. Each step is deliberately small, and nothing ever moves the
// player — you stand in one place the whole way through.
//
// A lesson gets a `ctx` with:
//   ctx.spawn(radius, {angle, height, label, mover})  -> Target
//   ctx.clearTargets()   ctx.targets   ctx.say({...})
//   ctx.done()           ctx.stats
// and may implement start / update / onHit / onMiss.

const HOLD_MS = 1200;

export const LESSONS = [
  {
    id: 'aim',
    title: 'Lesson 1 of 7',
    instruction: 'Point your hand at the circle.\nHold the white dot on it.',
    footer: 'No buttons yet — just aim.',
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
    title: 'Lesson 2 of 7',
    instruction: 'Now aim at the circle and squeeze the trigger\nwith your index finger.',
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
    title: 'Lesson 3 of 7',
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
    title: 'Lesson 4 of 7',
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
    title: 'Lesson 5 of 7',
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
    id: 'controls',
    title: 'Lesson 6 of 7',
    instruction: 'Now the rest of the controller.\nPress each part once so we can check it.',
    footer: '',
    needsHeadset: true,
    start(ctx) {
      ctx.beginControllerCheck();
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
      const { done, total } = check.counts;
      if (next) {
        const name = ctx.labelFor(next.check, next.hand);
        ctx.say({
          instruction: `${next.hand === 'left' ? 'Left' : 'Right'} hand: ${name}.\n${next.check.hint}`,
          footer: `${done} of ${total} checked — no rush, and nothing here can go wrong`,
        });
      }
    },
    // Pointing at a target during this lesson is fine, it just does not advance it.
    onMiss() {},
  },

  {
    id: 'system',
    title: 'Lesson 7 of 7',
    instruction: 'Two buttons sit below the rest, and they belong to the headset\nrather than to this page.',
    footer: 'The Meta button on the right, the Menu button on the left.',
    needsHeadset: true,
    start(ctx) {
      this.startedAt = performance.now();
      this.baseline = ctx.systemTrips;
      ctx.say({
        instruction: 'Press the round Meta button below your right thumb.\nEverything here will vanish. That is meant to happen.',
        footer: 'Then press it once more to come back.',
      });
    },
    update(dt, ctx) {
      if (ctx.systemTrips > this.baseline) {
        ctx.say({
          instruction: 'And there you are again.\nThat is how you get back from anywhere.',
          footer: 'Nothing you press on that menu can break this page.',
        });
        // A short beat so the sentence can be read before the lesson turns over.
        if (!this.returnedAt) this.returnedAt = performance.now();
        if (performance.now() - this.returnedAt > 2600) ctx.done();
      }
    },
    onMiss() {},
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
