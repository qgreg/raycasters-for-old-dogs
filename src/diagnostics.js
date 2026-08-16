import { Panel, COLORS } from './ui3d.js';

const n = (v, digits = 2) => (typeof v === 'number' ? v.toFixed(digits) : '—');

/**
 * The "tester" half of the app: a live board showing what the ray caster is
 * actually doing — which inputs are connected, what the buttons read, where the
 * ray is pointing and what it hit.
 */
export class Diagnostics {
  constructor(renderer, pointers, { width = 1.15, height = 1.35 } = {}) {
    this.renderer = renderer;
    this.pointers = pointers;
    this.panel = new Panel({ width, height, pxPerMeter: 620 });

    this.frames = 0;
    this.fps = 0;
    this.fpsClock = performance.now();
    this.lastDraw = 0;
    this.supported = null; // filled in by app.js once isSessionSupported resolves
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
    // Redrawing a canvas texture is not free; 5 Hz is plenty to read.
    if (now - this.lastDraw < 200) return;
    this.lastDraw = now;
    this.panel.rows({ title: 'Under the hood', rows: this.#collect(), rowSize: 0.042 });
  }

  #collect() {
    const xr = this.renderer.xr;
    const session = xr.getSession();
    const rows = [];
    rows.push(['skip unless curious', '']);
    rows.push(['', '']);

    const fpsColor = this.fps >= 68 ? COLORS.good : this.fps >= 45 ? COLORS.warn : COLORS.bad;
    rows.push(['fps', this.fps || '—', fpsColor]);
    rows.push(['webxr', this.supported === null ? 'checking' : this.supported ? 'supported' : 'no',
      this.supported ? COLORS.good : COLORS.warn]);
    rows.push(['session', session ? 'immersive-vr' : 'flat screen', session ? COLORS.good : COLORS.inkDim]);
    rows.push(['ref space', xr.getReferenceSpaceType?.() || '—']);
    if (session?.frameRate) rows.push(['refresh', `${Math.round(session.frameRate)} Hz`]);

    const sources = session ? Array.from(session.inputSources) : [];
    rows.push(['inputs', sources.length || (session ? 0 : 'mouse')]);
    rows.push(['', '']);

    const active = this.pointers.all.filter((p) => p.connected);
    if (!active.length) {
      rows.push(['no pointer', 'waiting…', COLORS.warn]);
      return rows;
    }

    for (const pointer of active) {
      const hand = pointer.handedness;
      const tag = hand === 'left' ? 'L' : hand === 'right' ? 'R' : '·';
      const source = pointer.inputSource;

      if (source) {
        rows.push([`${tag} mode`, source.targetRayMode + (pointer.isHand ? ' (hand)' : '')]);
        const profile = source.profiles?.[0];
        if (profile) rows.push([`${tag} profile`, shorten(profile)]);

        const pad = source.gamepad;
        if (pad) {
          const trigger = pad.buttons[0];
          const grip = pad.buttons[1];
          rows.push([`${tag} trigger`, bar(trigger?.value ?? 0), trigger?.pressed ? COLORS.good : COLORS.ink]);
          rows.push([`${tag} grip`, bar(grip?.value ?? 0), grip?.pressed ? COLORS.good : COLORS.ink]);
          const [x = 0, y = 0] = pad.axes.length >= 4 ? pad.axes.slice(2) : pad.axes;
          rows.push([`${tag} stick`, `${n(x, 1)}, ${n(y, 1)}`]);
          const pressed = pad.buttons
            .map((b, i) => (b.pressed ? BUTTON_NAMES[i] || `b${i}` : null))
            .filter(Boolean);
          rows.push([`${tag} pressed`, pressed.join(' ') || '—']);
        } else {
          rows.push([`${tag} gamepad`, 'none', COLORS.warn]);
        }
      } else {
        rows.push([`${tag} pointer`, 'mouse ray']);
      }

      const d = pointer.raycaster.ray.direction;
      rows.push([`${tag} dir`, `${n(d.x, 2)} ${n(d.y, 2)} ${n(d.z, 2)}`]);
      rows.push([`${tag} hit`, pointer.hovered ? `${n(pointer.hitDistance, 2)} m` : 'nothing',
        pointer.hovered ? COLORS.good : COLORS.inkDim]);
      rows.push(['', '']);
    }

    return rows;
  }
}

const BUTTON_NAMES = ['trig', 'grip', '—', 'stick', 'A/X', 'B/Y'];

function shorten(profile) {
  return profile.replace('oculus-', '').replace('meta-', '').replace('generic-', '').slice(0, 22);
}

// A tiny text meter, e.g. "▮▮▮▯▯▯ 0.52".
function bar(value) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 6);
  return '▮'.repeat(filled) + '▯'.repeat(6 - filled) + ' ' + value.toFixed(2);
}
