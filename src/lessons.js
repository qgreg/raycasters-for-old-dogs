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
    title: 'Lesson 1 of 5',
    instruction: 'Point your hand at the blue circle.\nHold the white dot on it.',
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
    title: 'Lesson 2 of 5',
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
    title: 'Lesson 3 of 5',
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
    title: 'Lesson 4 of 5',
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
    title: 'Lesson 5 of 5',
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
