import * as THREE from '../vendor/three.module.js';
import { sfx, resume as resumeAudio } from './audio.js';

const MAX_RAY = 8;          // metres the beam travels when it hits nothing
const BEAM_RADIUS = 0.0055; // a hair thicker than a laser pointer, so it reads at arm's length

function makeBeamGeometry() {
  // Cylinder is built along +Y; turn it to face -Z and push it so it starts at
  // the controller and extends forward one unit (scaled per-frame).
  const geo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS * 0.6, 1, 8, 1, true);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -0.5);
  return geo;
}

/**
 * One aimable ray. Backs an XR controller, an XR hand (WebXR gives hands a
 * target ray of their own, so pinching behaves exactly like a trigger), or the
 * mouse when running on a flat screen.
 */
class Pointer {
  constructor(scene, { kind, index }) {
    this.kind = kind;      // 'xr' | 'mouse'
    this.index = index;
    this.inputSource = null;
    this.connected = kind === 'mouse';
    this.hovered = null;
    this.selecting = false;
    this.raycaster = new THREE.Raycaster();
    this.hitPoint = new THREE.Vector3();
    this.hitDistance = 0;

    this.beam = new THREE.Mesh(
      makeBeamGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xE8A33D, transparent: true, opacity: 0.75, depthWrite: false })
    );
    this.beam.visible = false;

    this.reticle = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xF5E6C8, depthTest: false, transparent: true })
    );
    this.reticle.renderOrder = 999;
    this.reticle.visible = false;
    scene.add(this.reticle);
  }

  get handedness() {
    return this.inputSource?.handedness || (this.kind === 'mouse' ? 'mouse' : 'unknown');
  }

  get isHand() {
    return !!this.inputSource?.hand;
  }

  pulse(intensity = 0.3, ms = 40) {
    const actuators = this.inputSource?.gamepad?.hapticActuators;
    if (actuators && actuators[0]) {
      try { actuators[0].pulse(intensity, ms); } catch { /* not fatal */ }
    }
  }
}

export class Pointers {
  /**
   * @param {object} opts
   * @param {() => boolean} opts.isDragging - true while the flat-screen user is
   *   dragging to look around, so the drag is not mistaken for a click.
   */
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.isDragging = opts.isDragging || (() => false);

    this.interactables = [];
    this.onSelect = () => {};   // (interactive, pointer)
    this.onMiss = () => {};     // (pointer)
    this.onHover = () => {};    // (interactive|null, pointer)

    this.xrPointers = [];
    for (let i = 0; i < 2; i++) {
      const pointer = new Pointer(scene, { kind: 'xr', index: i });
      const controller = renderer.xr.getController(i);
      controller.add(pointer.beam);
      scene.add(controller);
      pointer.controller = controller;

      controller.addEventListener('connected', (event) => {
        pointer.inputSource = event.data;
        pointer.connected = true;
        pointer.beam.visible = true;
      });
      controller.addEventListener('disconnected', () => {
        pointer.inputSource = null;
        pointer.connected = false;
        pointer.beam.visible = false;
        pointer.reticle.visible = false;
      });
      controller.addEventListener('selectstart', () => {
        pointer.selecting = true;
        resumeAudio();
        this.#fire(pointer);
      });
      controller.addEventListener('selectend', () => { pointer.selecting = false; });

      this.xrPointers.push(pointer);
    }

    // Flat-screen pointer.
    this.mouse = new Pointer(scene, { kind: 'mouse', index: 2 });
    this.mouseNDC = new THREE.Vector2(0, 0);
    // The mouse ray stays parked until the user actually moves or taps, so the
    // beam does not sit on a target and "aim" for them before they have tried.
    this.mouseActive = false;
    this.#bindMouse(renderer.domElement);
  }

  get all() {
    if (this.renderer.xr.isPresenting) return this.xrPointers;
    return this.mouseActive ? [this.mouse] : [];
  }

  #bindMouse(el) {
    let downAt = 0;
    let downPos = null;

    const track = (e) => {
      const rect = el.getBoundingClientRect();
      this.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.mouseActive = true;
    };

    el.addEventListener('pointermove', track);

    el.addEventListener('pointerdown', (e) => {
      track(e);
      downAt = performance.now();
      downPos = { x: e.clientX, y: e.clientY };
      resumeAudio();
    });

    el.addEventListener('pointerup', (e) => {
      if (this.renderer.xr.isPresenting || !downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      const quick = performance.now() - downAt < 500;
      downPos = null;
      // A click is a tap that did not turn into a look-around drag.
      if (moved < 6 && quick && !this.isDragging()) this.#fire(this.mouse);
    });
  }

  #fire(pointer) {
    // A mouse can travel a long way between frames, so re-aim before deciding
    // what was clicked rather than trusting the last frame's hit test.
    if (pointer.kind === 'mouse') this.#aim(pointer);
    if (pointer.hovered) {
      pointer.pulse(0.6, 60);
      this.onSelect(pointer.hovered, pointer);
    } else {
      this.onMiss(pointer);
    }
  }

  /** Objects the beam can land on. Pass Target / Button3D instances. */
  setInteractables(list) {
    this.interactables = list;
  }

  /** Point the ray where the pointer is looking and work out what it lands on. */
  #aim(pointer) {
    if (pointer.kind === 'xr') {
      const m = pointer.controller.matrixWorld;
      pointer.raycaster.ray.origin.setFromMatrixPosition(m);
      pointer.raycaster.ray.direction.set(0, 0, -1).transformDirection(m).normalize();
    } else {
      pointer.raycaster.setFromCamera(this.mouseNDC, this.camera);
    }
    pointer.raycaster.far = MAX_RAY;

    const hit = this.#hitTest(pointer);

    if (hit) {
      pointer.hitPoint.copy(hit.point);
      pointer.hitDistance = hit.distance;
    } else {
      pointer.hitDistance = MAX_RAY;
      pointer.raycaster.ray.at(MAX_RAY, pointer.hitPoint);
    }

    const interactive = hit ? hit.object.userData.interactive : null;
    if (interactive !== pointer.hovered) this.#setHover(pointer, interactive);

    return hit;
  }

  #hitTest(pointer) {
    const meshes = [];
    for (const item of this.interactables) {
      item.traverse((o) => { if (o.userData.interactive) meshes.push(o); });
    }
    return pointer.raycaster.intersectObjects(meshes, false)[0] || null;
  }

  update() {
    const presenting = this.renderer.xr.isPresenting;
    this.mouse.reticle.visible = false;

    for (const pointer of this.xrPointers) {
      pointer.beam.visible = presenting && pointer.connected;
      if (!presenting || !pointer.connected) {
        pointer.reticle.visible = false;
        if (pointer.hovered) this.#setHover(pointer, null);
      }
    }

    for (const pointer of this.all) {
      if (pointer.kind === 'xr' && !pointer.connected) continue;

      const hit = this.#aim(pointer);

      // Beam stops at whatever it landed on; the dot sits just in front of it.
      if (pointer.kind === 'xr' && pointer.connected) {
        pointer.beam.scale.z = Math.max(0.05, pointer.hitDistance);
        pointer.beam.material.opacity = hit ? 0.95 : 0.5;
        pointer.beam.material.color.setHex(hit ? 0xF2D479 : 0xE8A33D);
      }

      const showDot = pointer.kind === 'xr' ? pointer.connected : true;
      pointer.reticle.visible = showDot;
      pointer.reticle.position.copy(pointer.hitPoint)
        .addScaledVector(pointer.raycaster.ray.direction, -0.01);
      pointer.reticle.scale.setScalar(hit ? 1.5 : 1);
      pointer.reticle.material.color.setHex(hit ? 0xF5E6C8 : 0xA79C86);
      pointer.reticle.material.opacity = hit ? 1 : 0.6;
    }
  }

  #setHover(pointer, interactive) {
    const previous = pointer.hovered;
    // Only drop the highlight if no other pointer is still resting on it.
    if (previous && !this.all.some((p) => p !== pointer && p.hovered === previous)) {
      if (previous.setHovered) previous.setHovered(false);
    }
    pointer.hovered = interactive;
    if (interactive) {
      if (interactive.setHovered) interactive.setHovered(true);
      pointer.pulse(0.15, 20);
      sfx.hover();
    }
    this.onHover(interactive, pointer);
  }
}
