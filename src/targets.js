import * as THREE from '../vendor/three.module.js';

const IDLE = 0x2f6fb0;
const HOVER = 0x4cc2ff;
const HIT = 0x63e6a0;

/**
 * A big friendly disc to point at. Faces the player, glows on hover, pops when
 * hit. `radius` is in metres — the lessons start large and shrink from there.
 */
export class Target extends THREE.Group {
  constructor(radius = 0.28, { label = '' } = {}) {
    super();
    this.radius = radius;
    this.hovered = false;
    this.dead = false;
    this.bornAt = performance.now();
    this.hoverStartedAt = 0;
    this.hoverHeld = 0;

    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({ color: IDLE, transparent: true, opacity: 0.92 })
    );
    this.add(this.disc);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.08, radius * 0.09, 12, 48),
      new THREE.MeshBasicMaterial({ color: HOVER })
    );
    this.add(this.ring);

    // A small bullseye so there is an obvious thing to put the dot on.
    this.pip = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.16, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.pip.position.z = 0.002;
    this.add(this.pip);

    if (label) this.add(makeLabel(label, radius));

    // Only the disc needs to be hit-testable; the ring sticks out past it.
    this.disc.userData.interactive = this;
    this.userData.isTarget = true;

    this.spawnT = 0;
    this.scale.setScalar(0.01);
  }

  setHovered(hovered) {
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.disc.material.color.setHex(hovered ? HOVER : IDLE);
    this.hoverStartedAt = hovered ? performance.now() : 0;
  }

  /** Returns milliseconds from spawn to this moment. */
  age() {
    return performance.now() - this.bornAt;
  }

  hit() {
    this.dead = true;
    this.hitAt = performance.now();
    this.disc.material.color.setHex(HIT);
    this.ring.material.color.setHex(HIT);
    this.pip.visible = false;
  }

  update(dt) {
    // Spawn pop-in.
    if (this.spawnT < 1 && !this.dead) {
      this.spawnT = Math.min(1, this.spawnT + dt * 6);
      const e = 1 - Math.pow(1 - this.spawnT, 3);
      this.scale.setScalar(e * (1 + 0.08 * Math.sin(e * Math.PI)));
    }

    if (this.hovered && !this.dead) {
      this.hoverHeld = performance.now() - this.hoverStartedAt;
      const pulse = 1 + 0.04 * Math.sin(performance.now() * 0.008);
      this.ring.scale.setScalar(pulse);
    } else {
      this.hoverHeld = 0;
      this.ring.scale.setScalar(1);
    }

    // Death animation: swell and fade, then ask to be removed.
    if (this.dead) {
      const t = (performance.now() - this.hitAt) / 320;
      if (t >= 1) return false;
      this.scale.setScalar(1 + t * 0.7);
      this.disc.material.opacity = 1 - t;
      this.ring.material.transparent = true;
      this.ring.material.opacity = 1 - t;
    }
    return true;
  }

  dispose() {
    this.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

function makeLabel(text, radius) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 96px system-ui, sans-serif';
  ctx.fillStyle = '#eef2fb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 84);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const w = radius * 2.4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w * (160 / 512)),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  mesh.position.set(0, -radius * 1.5, 0.002);
  return mesh;
}
