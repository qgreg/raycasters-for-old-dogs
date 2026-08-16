import * as THREE from '../vendor/three.module.js';
import { Panel, COLORS } from './ui3d.js';
import { CHECKS, checkById, labelFor, thumbstick, isLive } from './controllermap.js';

/**
 * A live picture of one controller, drawn to a canvas.
 *
 * Four states are shown at once, and they mean different things:
 *   waiting   — outline only, not yet proven
 *   asked for — pulsing biscuit outline, this is the one to try now
 *   live      — filled biscuit, you are pressing it this instant
 *   confirmed — green tick, it has been proven to work
 *
 * The thumbstick shows a dot at its true deflection, so the stick can be seen
 * moving rather than merely reported. If a runtime inverts an axis, the dot
 * moving the "wrong" way against the highlighted arrow makes that obvious.
 */

const DARK = '#1C1A17';       // legible on a biscuit fill
const IDLE_LINE = 'rgba(167, 156, 134, 0.75)';
const BODY_LINE = 'rgba(167, 156, 134, 0.35)';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tick(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.5, y);
  ctx.lineTo(x - size * 0.1, y + size * 0.42);
  ctx.lineTo(x + size * 0.55, y - size * 0.45);
  ctx.stroke();
}

/** One control's presentation, resolved from its three possible states. */
function styleFor({ confirmed, live, wanted, pulse }) {
  if (live) return { fill: COLORS.accent, stroke: '#F5E6C8', text: DARK, label: COLORS.accent };
  if (confirmed) return { fill: 'rgba(143, 185, 106, 0.22)', stroke: COLORS.good, text: COLORS.good, label: COLORS.good };
  if (wanted) {
    const a = 0.55 + 0.45 * pulse;
    return { fill: `rgba(242, 212, 121, ${0.10 + 0.12 * pulse})`, stroke: `rgba(242, 212, 121, ${a})`, text: COLORS.accent, label: COLORS.accent };
  }
  return { fill: 'rgba(0,0,0,0)', stroke: IDLE_LINE, text: COLORS.inkDim, label: COLORS.inkDim };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 *   handedness 'left'|'right'
 *   gamepad    live Gamepad, or null when the controller is not present
 *   isConfirmed (checkId) => boolean
 *   wantedId   the control being asked for on this hand, or null
 *   pulse      0..1, for the "try this one" animation
 */
export function drawController(ctx, w, h, opts) {
  const { handedness, gamepad = null, isConfirmed = () => false, wantedId = null, pulse = 0 } = opts;
  const left = handedness === 'left';

  // Both hands are drawn with the SAME layout. Mirroring them made each picture
  // read as the other hand's controller, and — worse — it flipped the stick
  // arrows and the live dot, so pushing left lit the right arrow. The big L/R
  // and the button letters are what tell the two apart.
  const X = (u) => u * w;
  const Y = (v) => v * h;
  const S = (u) => u * w;

  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 3, 3, w - 6, h - 6, S(0.04));
  ctx.fillStyle = 'rgba(28, 26, 23, 0.93)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(242, 212, 121, 0.30)';
  ctx.stroke();

  const state = (id) => {
    const check = checkById(id);
    return styleFor({
      confirmed: isConfirmed(id),
      live: check ? isLive(check, gamepad) : false,
      wanted: wantedId === id,
      pulse,
    });
  };

  // --- title: a big letter, readable at a glance and from the corner of an eye
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 ${Math.round(S(0.13))}px system-ui, sans-serif`;
  ctx.fillStyle = gamepad ? COLORS.accent : COLORS.inkDim;
  ctx.fillText(left ? 'L' : 'R', S(0.08), Y(0.022));

  ctx.textAlign = 'right';
  ctx.font = `700 ${Math.round(S(0.062))}px system-ui, sans-serif`;
  ctx.fillText(left ? 'LEFT HAND' : 'RIGHT HAND', S(0.92), Y(0.055));

  if (!gamepad) {
    ctx.textAlign = 'center';
    ctx.font = `500 ${Math.round(S(0.055))}px system-ui, sans-serif`;
    ctx.fillStyle = COLORS.inkDim;
    ctx.fillText('no controller yet', w / 2, Y(0.5));
    return;
  }

  // --- the body outline, so the parts sit on something recognisable ----------
  ctx.strokeStyle = BODY_LINE;
  ctx.lineWidth = 3;
  roundRect(ctx, S(0.10), Y(0.325), S(0.80), Y(0.545), S(0.15));
  ctx.stroke();

  // --- analog meters: trigger and grip --------------------------------------
  const meter = (id, label, value, top) => {
    const s = state(id);
    const x = S(0.10);
    const width = S(0.80);
    const height = Y(0.048);
    const y = Y(top);

    ctx.font = `700 ${Math.round(S(0.048))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = s.label;
    ctx.fillText(label, x, y - Y(0.046));

    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = 'rgba(167, 156, 134, 0.12)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = s.stroke;
    ctx.stroke();

    // Fill proportional to how hard it is being squeezed.
    if (value > 0.02) {
      ctx.save();
      roundRect(ctx, x, y, width, height, height / 2);
      ctx.clip();
      ctx.fillStyle = isConfirmed(id) && value < 0.6 ? 'rgba(143, 185, 106, 0.5)' : COLORS.accent;
      ctx.fillRect(x, y, width * Math.min(1, value), height);
      ctx.restore();
    }
    if (isConfirmed(id)) tick(ctx, x + width - S(0.055), y + height / 2, S(0.05), COLORS.good);
  };

  meter('trigger', 'Trigger', gamepad.buttons[0]?.value ?? 0, 0.175);
  meter('grip', 'Grip', gamepad.buttons[1]?.value ?? 0, 0.272);

  // --- thumbstick, with a direction arrow per check -------------------------
  const cx = X(0.35);
  const cy = Y(0.525);
  const radius = S(0.135);

  const clickState = state('stickClick');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = clickState.fill === 'rgba(0,0,0,0)' ? 'rgba(167, 156, 134, 0.10)' : clickState.fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = clickState.stroke;
  ctx.stroke();

  const ARROWS = {
    stickUp: [0, -1],
    stickDown: [0, 1],
    stickLeft: [-1, 0],
    stickRight: [1, 0],
  };

  // Directions are never mirrored: left is left on both hands.
  for (const [id, [dx, dy]] of Object.entries(ARROWS)) {
    const s = state(id);
    const distance = radius * 1.52;
    const size = S(0.05);

    ctx.save();
    ctx.translate(cx + dx * distance, cy + dy * distance);
    ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.85, size * 0.7);
    ctx.lineTo(-size * 0.85, size * 0.7);
    ctx.closePath();
    ctx.fillStyle = isConfirmed(id) ? COLORS.good : s.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = isConfirmed(id) ? COLORS.good : s.stroke;
    ctx.stroke();
    ctx.restore();
  }

  // The live dot: where the stick actually is, right now.
  const { x: sx, y: sy } = thumbstick(gamepad);
  ctx.beginPath();
  ctx.arc(cx + sx * radius * 0.62, cy + sy * radius * 0.62, radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = Math.hypot(sx, sy) > 0.15 ? COLORS.accent : COLORS.inkDim;
  ctx.fill();

  ctx.font = `600 ${Math.round(S(0.04))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = state('stickClick').label;
  ctx.fillText('press to click', cx, cy + radius * 1.95);

  // --- the two round face buttons -------------------------------------------
  const faceButton = (id, u, v) => {
    const s = state(id);
    const bx = X(u);
    const by = Y(v);
    const r = S(0.072);
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = s.fill === 'rgba(0,0,0,0)' ? 'rgba(167, 156, 134, 0.10)' : s.fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = s.stroke;
    ctx.stroke();

    ctx.font = `800 ${Math.round(S(0.062))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = s.text;
    ctx.fillText(labelFor(checkById(id), handedness).replace(' button', ''), bx, by);
    ctx.textBaseline = 'top';
  };

  faceButton('upper', 0.745, 0.462);
  faceButton('lower', 0.745, 0.625);

  // --- the button this page never sees --------------------------------------
  // Drawn as a plainly-labelled strip rather than a dot placed from guesswork:
  // where it sits varies by controller, and a confidently wrong position is
  // worse than an honest label.
  const stripY = Y(0.772);
  const stripH = Y(0.08);
  ctx.save();
  ctx.setLineDash([S(0.028), S(0.022)]);
  roundRect(ctx, S(0.10), stripY, S(0.80), stripH, stripH / 2);
  ctx.fillStyle = 'rgba(167, 156, 134, 0.07)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(167, 156, 134, 0.55)';
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(S(0.05))}px system-ui, sans-serif`;
  ctx.fillStyle = COLORS.inkDim;
  ctx.fillText(left ? '\u2261  Menu button' : '\u25CB  Meta button', w / 2, stripY + stripH / 2);
  ctx.textBaseline = 'top';

  ctx.font = `500 ${Math.round(S(0.038))}px system-ui, sans-serif`;
  ctx.fillText('below the others — the headset', w / 2, Y(0.878));
  ctx.fillText('keeps this one to itself', w / 2, Y(0.918));
}

/** The diagram as a panel in the world. */
export class ControllerDiagram {
  constructor(handedness, { width = 0.62, height = 0.86 } = {}) {
    this.handedness = handedness;
    this.panel = new Panel({ width, height, pxPerMeter: 760 });
    this.panel.visible = false;
  }

  get object3D() { return this.panel; }

  set visible(value) { this.panel.visible = value; }
  get visible() { return this.panel.visible; }

  update(gamepad, check) {
    if (!this.panel.visible) return;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
    const wanted = check?.wantedFor(this.handedness);
    drawController(this.panel.ctx, this.panel.canvas.width, this.panel.canvas.height, {
      handedness: this.handedness,
      gamepad,
      isConfirmed: (id) => !!check?.confirmed[this.handedness]?.[id],
      wantedId: wanted?.id ?? null,
      pulse,
    });
    this.panel.texture.needsUpdate = true;
  }
}

export { CHECKS };
