import { Panel, COLORS } from './ui3d.js';
import { thumbstick } from './controllermap.js';

const n = (v, digits = 2) => (typeof v === 'number' ? v.toFixed(digits) : '—');

/**
 * The "tester" half of the app: a live board showing what the ray caster is
 * actually doing — which inputs are connected, what the buttons read, where the
 * ray is pointing and what it hit.
 *
 * Laid out as shared readings across the top and one column per hand below.
 * Everything used to stack in a single column, which forced the type small
 * enough to be hard work to read; two columns halve the line count and let the
 * same content be drawn about twice the size. Labels are abbreviated for the
 * same reason — the width saved goes into the type.
 */
export class Diagnostics {
  constructor(renderer, pointers, { width = 1.62, height = 1.5 } = {}) {
    this.renderer = renderer;
    this.pointers = pointers;
    this.panel = new Panel({ width, height, pxPerMeter: 600 });

    this.frames = 0;
    this.fps = 0;
    this.fpsClock = performance.now();
    this.lastDraw = 0;
    this.supported = null;  // filled in by app.js once isSessionSupported resolves
    this.systemTrips = 0;
  }

  get object3D() { return this.panel; }

  update() {
    this.frames++;
    const now = performance.now();
    if (now - this.fpsClock >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsClock));
      this.frames = 0;
      this.fpsClock = now;
    }
    if (!this.panel.visible) return;
    // Redrawing a canvas texture is not free; 5 Hz is plenty to read.
    if (now - this.lastDraw < 200) return;
    this.lastDraw = now;
    this.panel.board(this.collect());
  }

  collect() {
    const xr = this.renderer.xr;
    const session = xr.getSession();
    const sources = session ? Array.from(session.inputSources) : [];

    const fpsColor = this.fps >= 68 ? COLORS.good : this.fps >= 45 ? COLORS.warn : COLORS.bad;
    const header = [
      ['fps', this.fps || '—', fpsColor],
      ['refresh', session?.frameRate ? `${Math.round(session.frameRate)}Hz` : '—'],
      ['mode', session ? 'VR' : 'flat', session ? COLORS.good : COLORS.inkDim],
      ['inputs', session ? sources.length : 'mouse'],
      // Values are kept short on purpose: the longest pair on the board sets
      // the type size for every other reading on it.
      ['space', (xr.getReferenceSpaceType?.() || '—').replace('local-', '')],
      ['trips', this.systemTrips, this.systemTrips > 0 ? COLORS.good : COLORS.inkDim],
    ];

    const active = this.pointers.all.filter((p) => p.connected);
    const columns = [];

    for (const hand of ['left', 'right']) {
      const pointer = active.find((p) => p.handedness === hand);
      if (!pointer) continue;
      columns.push({ heading: hand === 'left' ? 'LEFT' : 'RIGHT', rows: this.handRows(pointer) });
    }

    // Flat-screen or hand-tracked input has no handedness pair to split.
    if (!columns.length) {
      const rows = active.length
        ? this.handRows(active[0])
        : [['waiting', 'for input', COLORS.warn]];
      columns.push({ heading: active[0]?.handedness?.toUpperCase() || 'POINTER', rows });
    }

    return {
      title: 'Under the hood',
      subtitle: 'skip unless curious',
      header,
      columns,
    };
  }

  handRows(pointer) {
    const source = pointer.inputSource;
    const rows = [];

    if (!source) {
      rows.push(['mode', 'mouse ray']);
      rows.push(['hit', pointer.hovered ? `${n(pointer.hitDistance)}m` : '—',
        pointer.hovered ? COLORS.good : COLORS.inkDim]);
      return rows;
    }

    // The reported profile is the ground truth for which controller layout this
    // actually is — worth showing rather than assuming.
    rows.push(['kit', kitName(source.profiles?.[0])]);
    if (pointer.isHand) rows.push(['tracked', 'hand', COLORS.good]);

    const pad = source.gamepad;
    if (!pad) {
      rows.push(['gamepad', 'none', COLORS.warn]);
    } else {
      const trigger = pad.buttons[0];
      const grip = pad.buttons[1];
      rows.push(['trig', bar(trigger?.value ?? 0), trigger?.pressed ? COLORS.good : COLORS.ink]);
      rows.push(['grip', bar(grip?.value ?? 0), grip?.pressed ? COLORS.good : COLORS.ink]);

      const { x, y } = thumbstick(pad);
      rows.push(['stick', `${n(x, 1)},${n(y, 1)}`, Math.hypot(x, y) > 0.2 ? COLORS.good : COLORS.ink]);

      // Only what is actually being touched or pressed. Listing every button
      // idle made this the longest line on the board, and the whole board had
      // to shrink to fit it — the hand pictures already show what exists.
      const live = [];
      const unknown = [];
      pad.buttons.forEach((button, index) => {
        if (!button.pressed && !button.touched) return;
        const name = buttonName(index, pointer.handedness);
        const mark = button.pressed ? '!' : '~';
        (name ? live : unknown).push((name ?? index) + mark);
      });
      rows.push(['btns', live.join(' ') || '—', live.length ? COLORS.good : COLORS.inkDim]);
      if (unknown.length) rows.push(['other', unknown.join(' '), COLORS.warn]);
    }

    rows.push(['hit', pointer.hovered ? `${n(pointer.hitDistance)}m` : '—',
      pointer.hovered ? COLORS.good : COLORS.inkDim]);
    return rows;
  }
}

// Names for the xr-standard indices Touch controllers report. Anything outside
// this list is shown by number instead of being quietly dropped.
function buttonName(index, handedness) {
  const left = handedness === 'left';
  return {
    0: 'T',
    1: 'G',
    3: 'S',
    4: left ? 'X' : 'A',
    5: left ? 'Y' : 'B',
    6: 'R',
  }[index] || null;
}

function shorten(text, max) {
  return String(text)
    .replace('oculus-', '')
    .replace('meta-', '')
    .replace('generic-', '')
    .slice(0, max);
}

// Controller profiles are long enough to force the whole board smaller, so the
// familiar ones get a short name and anything unknown is trimmed rather than
// allowed to set the type size for everything else.
function kitName(profile) {
  if (!profile) return '—';
  const known = {
    'meta-quest-touch-plus': 'touch-plus',
    'meta-quest-touch-pro': 'touch-pro',
    'oculus-touch-v3': 'touch-v3',
    'oculus-touch-v2': 'touch-v2',
    'oculus-touch': 'touch',
  };
  return known[profile] || shorten(profile, 11);
}

// A tiny text meter, e.g. "▮▮▯▯ .52".
function bar(value) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 4);
  return '▮'.repeat(filled) + '▯'.repeat(4 - filled) + value.toFixed(2).replace('0.', '.');
}
