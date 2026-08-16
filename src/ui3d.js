import * as THREE from '../vendor/three.module.js';

// Everything drawn in here is rendered to a 2D canvas and pasted onto a plane in
// the world. Text is sized for someone who does not want to squint.

const PX_PER_METER = 640;

// Biscuit & Espresso. Warm hues pass through an aging lens at close to full
// strength, where blues arrive dimmed — so the type is biscuit and cream on a
// warm dark ground, never bright fields that would glare at two metres.
export const COLORS = {
  ink: '#F5E6C8',
  inkDim: '#A79C86',
  accent: '#F2D479',
  good: '#8FB96A',
  warn: '#E8A33D',
  bad: '#D97A5A',
  panel: 'rgba(28, 26, 23, 0.93)',
  panelEdge: 'rgba(242, 212, 121, 0.38)',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wraps `text` to `maxWidth` px, honouring explicit newlines.
function wrap(ctx, text, maxWidth) {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    if (paragraph === '') { out.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

/** A flat panel in the world with a 2D canvas for a face. */
export class Panel extends THREE.Mesh {
  constructor({ width = 1.6, height = 0.9, pxPerMeter = PX_PER_METER } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * pxPerMeter);
    canvas.height = Math.round(height * pxPerMeter);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    super(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
    );

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texture = texture;
    this.panelWidth = width;
    this.panelHeight = height;
    this.renderOrder = 1;
  }

  get pad() { return Math.round(this.canvas.width * 0.045); }

  background(fill = COLORS.panel, edge = COLORS.panelEdge) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, Math.round(canvas.width * 0.016));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = edge;
    ctx.stroke();
  }

  /**
   * Draw a titled block of text.
   *  title  - small accent-coloured heading (optional)
   *  body   - the big readable message
   *  footer - small dim line at the bottom (optional)
   */
  write({ title = '', body = '', footer = '', bodySize = 0.085, align = 'center', bodyColor = COLORS.ink } = {}) {
    const { ctx, canvas } = this;
    const pad = this.pad;
    this.background();

    const centered = align === 'center';
    const x = centered ? canvas.width / 2 : pad;
    ctx.textAlign = centered ? 'center' : 'left';
    ctx.textBaseline = 'top';

    let y = pad;

    if (title) {
      const size = Math.round(canvas.width * 0.052);
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.fillStyle = COLORS.accent;
      ctx.fillText(title.toUpperCase(), x, y);
      y += size * 1.7;
    }

    const footerSize = Math.round(canvas.width * 0.045);

    if (body) {
      // Shrink the body until it fits the space between title and footer, so a
      // long sentence never runs over the line underneath it.
      const available = canvas.height - y - pad - (footer ? footerSize * 1.6 : 0);
      let size = Math.round(canvas.width * bodySize);
      let lines;
      let lineHeight;
      const floor = size * 0.5;
      for (;;) {
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        lines = wrap(ctx, body, canvas.width - pad * 2);
        lineHeight = size * 1.28;
        if (lines.length * lineHeight <= available || size <= floor) break;
        size = Math.round(size * 0.92);
      }

      ctx.fillStyle = bodyColor;
      let ty = y + Math.max(0, (available - lines.length * lineHeight) / 2);
      for (const line of lines) {
        ctx.fillText(line, x, ty);
        ty += lineHeight;
      }
    }

    if (footer) {
      const size = footerSize;
      ctx.font = `400 ${size}px system-ui, sans-serif`;
      ctx.fillStyle = COLORS.inkDim;
      ctx.textBaseline = 'bottom';
      ctx.fillText(footer, x, canvas.height - pad);
    }

    this.texture.needsUpdate = true;
  }

  /**
   * Draw a list of `[label, value, color?]` rows — used by the stats and
   * diagnostics boards.
   */
  rows({ title = '', rows = [], rowSize = 0.045 } = {}) {
    const { ctx, canvas } = this;
    const pad = this.pad;
    this.background();
    ctx.textBaseline = 'top';

    let y = pad;
    if (title) {
      const size = Math.round(canvas.width * 0.055);
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.fillStyle = COLORS.accent;
      ctx.textAlign = 'left';
      ctx.fillText(title.toUpperCase(), pad, y);
      y += size * 1.6;
    }

    // Shrink to fit rather than silently dropping the rows that do not — a
    // board that quietly shows one hand's worth of data is worse than a small one.
    const available = canvas.height - y - pad;
    let size = Math.round(canvas.width * rowSize);
    let lineHeight = size * 1.45;
    const floor = Math.round(canvas.width * 0.022);
    while (rows.length * lineHeight > available && size > floor) {
      size = Math.round(size * 0.94);
      lineHeight = size * 1.45;
    }
    ctx.font = `500 ${size}px ui-monospace, "SF Mono", Menlo, monospace`;

    for (const row of rows) {
      if (y + lineHeight > canvas.height - pad) break;
      const [label, value, color] = Array.isArray(row) ? row : [row, '', null];
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.inkDim;
      ctx.fillText(label, pad, y);
      if (value !== '') {
        ctx.textAlign = 'right';
        ctx.fillStyle = color || COLORS.ink;
        ctx.fillText(String(value), canvas.width - pad, y);
      }
      y += lineHeight;
    }

    this.texture.needsUpdate = true;
  }
}

/** A panel you can point at and click. */
export class Button3D extends THREE.Group {
  constructor(label, { width = 0.6, height = 0.18, onSelect = () => {} } = {}) {
    super();
    this.label = label;
    this.onSelectCb = onSelect;
    this.hovered = false;

    this.panel = new Panel({ width, height, pxPerMeter: 700 });
    this.add(this.panel);

    // The panel mesh is what the raycaster actually hits.
    this.panel.userData.interactive = this;
    this.draw();
  }

  setLabel(label) {
    this.label = label;
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this.panel;
    const hovered = this.hovered;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, canvas.height * 0.16);
    ctx.fillStyle = hovered ? 'rgba(242, 212, 121, 0.96)' : 'rgba(38, 34, 30, 0.95)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = hovered ? '#F5E6C8' : 'rgba(167, 156, 134, 0.7)';
    ctx.stroke();

    const size = Math.round(canvas.height * 0.42);
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillStyle = hovered ? '#1C1A17' : COLORS.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.label, canvas.width / 2, canvas.height / 2);

    this.panel.texture.needsUpdate = true;
  }

  setHovered(hovered) {
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.scale.setScalar(hovered ? 1.06 : 1);
    this.draw();
  }

  select() {
    this.onSelectCb(this);
  }
}
