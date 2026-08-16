import * as THREE from '../vendor/three.module.js';
import { Panel, Button3D, COLORS } from './ui3d.js';
import { Target } from './targets.js';
import { Pointers } from './pointers.js';
import { Diagnostics } from './diagnostics.js';
import { LESSONS, PRAISE } from './lessons.js';
import { ControllerCheck, labelFor } from './controllermap.js';
import { ControllerDiagram } from './controllerview.js';
import { sfx, resume as resumeAudio } from './audio.js';

const ARC_RADIUS = 2.1;   // how far away the targets float
const HEAD_HEIGHT = 1.6;  // assumed eye height when the headset has no floor

// ---------------------------------------------------------------- scene setup

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x26221E);
scene.fog = new THREE.Fog(0x26221E, 6, 18);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(0, HEAD_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

buildRoom();

function buildRoom() {
  const grid = new THREE.GridHelper(24, 24, 0x6b5f4a, 0x3a342c);
  grid.material.transparent = true;
  grid.material.opacity = 0.75;
  scene.add(grid);

  // A lit pad under the player's feet so it is obvious where "here" is.
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.62, 48),
    new THREE.MeshBasicMaterial({ color: 0xE8A33D, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.01;
  scene.add(pad);

  // Faint arc on the floor showing where the targets live.
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(ARC_RADIUS - 0.02, ARC_RADIUS + 0.02, 64, 1, Math.PI * 0.28, Math.PI * 0.44),
    new THREE.MeshBasicMaterial({ color: 0xb5813a, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.y = 0.012;
  scene.add(arc);
}

// ------------------------------------------------------------------ 3D panels

const instructionPanel = new Panel({ width: 2.0, height: 0.78 });
instructionPanel.position.set(0, 2.3, -2.3);
instructionPanel.rotation.x = 0.24;
scene.add(instructionPanel);

const statsPanel = new Panel({ width: 1.0, height: 0.9, pxPerMeter: 620 });
statsPanel.position.set(-1.32, 1.45, -1.72);
statsPanel.rotation.y = 0.6;
scene.add(statsPanel);

// A live picture of each controller, placed roughly where that hand is.
const diagrams = {
  left: new ControllerDiagram('left'),
  right: new ControllerDiagram('right'),
};
diagrams.left.object3D.position.set(-0.86, 1.52, -1.5);
diagrams.left.object3D.rotation.y = 0.42;
diagrams.right.object3D.position.set(0.86, 1.52, -1.5);
diagrams.right.object3D.rotation.y = -0.42;
scene.add(diagrams.left.object3D, diagrams.right.object3D);

// The hand pictures and the side boards want the same space either side of the
// player, so they take turns. The board's on/off is remembered as a preference
// and reasserts itself once the pictures are put away.
let handsVisible = false;
let boardWanted = true;

function applyPanels() {
  diagrams.left.visible = handsVisible;
  diagrams.right.visible = handsVisible;
  statsPanel.visible = !handsVisible;
  diagnostics.object3D.visible = boardWanted && !handsVisible;
  buttons[2]?.setLabel(handsVisible ? 'Hide hands' : 'Hands');
  buttons[3]?.setLabel(diagnostics.object3D.visible ? 'Hide board' : 'Board');
}

function setHandsVisible(visible) {
  handsVisible = visible;
  applyPanels();
}

const pointers = new Pointers(renderer, scene, camera, { isDragging: () => look.didDrag });
const diagnostics = new Diagnostics(renderer, pointers);
diagnostics.object3D.position.set(1.35, 1.5, -1.72);
diagnostics.object3D.rotation.y = -0.6;
scene.add(diagnostics.object3D);

const buttons = [
  new Button3D('Repeat', { onSelect: () => startLesson(lessonIndex) }),
  new Button3D('Skip', { onSelect: () => nextLesson() }),
  new Button3D('Hands', { onSelect: () => setHandsVisible(!handsVisible) }),
  new Button3D('Hide board', { onSelect: () => {
    boardWanted = !boardWanted;
    // Asking for the board is also a way of putting the pictures away.
    if (boardWanted) handsVisible = false;
    applyPanels();
  } }),
];
buttons.forEach((button, i) => {
  button.position.set(-1.02 + i * 0.68, 0.95, -1.7);
  button.rotation.x = -0.32;
  scene.add(button);
});

// -------------------------------------------------------------- game state

const clock = new THREE.Clock();
let elapsed = 0;
let lessonIndex = 0;
let lesson = null;
let finished = false;

const stats = { hits: 0, misses: 0, totalMs: 0, bestMs: Infinity };

const ctx = {
  targets: [],
  stats,
  spawn(radius, options = {}) {
    const target = new Target(radius, { label: options.label || '' });
    target.userData.angle = options.angle ?? 0;
    target.userData.height = options.height ?? 1.45;
    target.userData.mover = options.mover || null;
    target.userData.bornAtElapsed = elapsed;
    place(target, target.userData.angle, target.userData.height);
    ctx.targets.push(target);
    scene.add(target);
    refreshInteractables();
    return target;
  },
  clearTargets() {
    for (const target of ctx.targets) {
      scene.remove(target);
      target.dispose();
    }
    ctx.targets.length = 0;
    refreshInteractables();
  },
  say(partial) {
    say(partial);
  },
  done() {
    completeLesson();
  },

  // --- controller check, used by the "rest of the controller" lesson
  controllerCheck: null,
  labelFor,
  beginControllerCheck(ids) {
    ctx.controllerCheck = controllerCheck;
    controllerCheck.setFocus(ids);
  },
  pollControllerCheck() {
    const session = renderer.xr.getSession();
    if (!session) return;
    if (controllerCheck.poll(session.inputSources)) {
      sfx.click();
      const last = controllerCheck.lastConfirmed;
      // Buzz the hand that just proved a control works.
      for (const pointer of pointers.all) {
        if (pointer.handedness === last?.hand) pointer.pulse(0.5, 50);
      }
    }
  },

  // --- system buttons, which WebXR never sees pressed
  get systemTrips() { return systemTrips; },
};

const controllerCheck = new ControllerCheck();

// The Meta and Menu buttons belong to the runtime, so a page cannot read them.
// What it can see is the session being taken away and handed back — which is
// the thing actually worth teaching: how to get out, and how to get back.
let systemTrips = 0;
let sessionAway = false;

function watchSystemButtons(session) {
  session.addEventListener('visibilitychange', () => {
    if (session.visibilityState !== 'visible') {
      sessionAway = true;
    } else if (sessionAway) {
      sessionAway = false;
      systemTrips++;
    }
  });
}



function place(target, angleDeg, height) {
  const a = THREE.MathUtils.degToRad(angleDeg);
  target.position.set(Math.sin(a) * ARC_RADIUS, height, -Math.cos(a) * ARC_RADIUS);
  target.lookAt(0, height, 0);
}

function refreshInteractables() {
  pointers.setInteractables([...ctx.targets, ...buttons]);
}

// The instruction board keeps its last content so a lesson can change just the
// footer without restating everything. Redraw only when something actually
// changed — repainting a canvas texture every frame is wasteful.
let board = { title: '', instruction: '', footer: '' };

function say(partial) {
  const next = { ...board, ...partial };
  if (next.title === board.title && next.instruction === board.instruction && next.footer === board.footer) return;
  board = next;
  instructionPanel.write({
    title: board.title,
    body: board.instruction,
    footer: board.footer,
    bodySize: 0.062,
  });
}

function startLesson(index) {
  finished = false;
  lessonIndex = index;
  lesson = LESSONS[index];
  ctx.clearTargets();
  ctx.controllerCheck = null;
  setHandsVisible(!!lesson.showHands);

  // The controller lessons need real hardware. On a flat screen, say so once
  // and jump the whole run of them rather than skipping one at a time.
  if (lesson.needsHeadset && !renderer.xr.isPresenting) {
    const next = LESSONS.findIndex((l, i) => i > index && !l.needsHeadset);
    say({
      title: lesson.title,
      instruction: 'The controller lessons need the headset and its two controllers.',
      footer: 'Going straight to the pointing practice…',
    });
    const skipping = index;
    setTimeout(() => {
      if (lessonIndex === skipping && !finished) startLesson(next >= 0 ? next : index + 1);
    }, 2600);
    return;
  }
  say({ title: lesson.title, instruction: lesson.instruction, footer: lesson.footer || '' });
  buttons[1].setLabel(lesson.endless ? 'Finish' : 'Skip');
  lesson.start?.(ctx);
}

function nextLesson() {
  if (lessonIndex + 1 < LESSONS.length && !finished) startLesson(lessonIndex + 1);
  else showSummary();
}

function completeLesson() {
  sfx.lessonDone();
  const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];
  say({ instruction: praise, footer: 'Next one coming up…' });
  const finishedIndex = lessonIndex;
  setTimeout(() => {
    // Guard against the player having pressed Repeat/Skip during the pause.
    if (lessonIndex !== finishedIndex || finished) return;
    if (finishedIndex + 1 < LESSONS.length) startLesson(finishedIndex + 1);
    else showSummary();
  }, 1600);
}

function showSummary() {
  finished = true;
  lesson = null;
  ctx.clearTargets();
  const accuracy = stats.hits + stats.misses > 0
    ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100)
    : 0;
  say({
    title: 'All done',
    instruction: `You hit ${stats.hits} targets with ${accuracy}% accuracy.\nThat is all there is to pointing in VR.`,
    footer: 'Press Repeat to run through it again.',
  });
  buttons[0].setLabel('Start over');
  buttons[1].setLabel('Free practice');
  buttons[0].onSelectCb = () => { restoreButtons(); resetStats(); startLesson(0); };
  buttons[1].onSelectCb = () => { restoreButtons(); startLesson(LESSONS.length - 1); };
}

// The summary screen borrows the first two buttons; put them back afterwards.
function restoreButtons() {
  buttons[0].setLabel('Repeat');
  buttons[0].onSelectCb = () => startLesson(lessonIndex);
  buttons[1].onSelectCb = () => nextLesson();
}

function resetStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.totalMs = 0;
  stats.bestMs = Infinity;
}

// ---------------------------------------------------------------- pointer wiring

pointers.onSelect = (interactive, pointer) => {
  resumeAudio();
  if (interactive instanceof Button3D) {
    sfx.click();
    interactive.select();
    return;
  }
  if (interactive instanceof Target && !interactive.dead) {
    registerHit(interactive, pointer);
  }
};

pointers.onMiss = () => {
  if (!lesson) return;
  stats.misses++;
  sfx.miss();
  lesson.onMiss?.(ctx);
};

function registerHit(target, pointer) {
  const acquisitionMs = target.age();
  target.hit();
  target.disc.userData.interactive = null;
  if (pointer.hovered === target) pointer.hovered = null;

  stats.hits++;
  stats.totalMs += acquisitionMs;
  stats.bestMs = Math.min(stats.bestMs, acquisitionMs);
  sfx.hit();
  pointer.pulse(0.8, 70);

  lesson?.onHit?.(target, ctx);
}

function updateDiagrams() {
  if (!diagrams.left.visible && !diagrams.right.visible) return;
  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  for (const hand of ['left', 'right']) {
    const source = sources.find((s) => s.handedness === hand);
    diagrams[hand].update(source?.gamepad || null, controllerCheck);
  }
}

// ------------------------------------------------------------- stats board

let lastStatsDraw = 0;
function drawStats() {
  const now = performance.now();
  if (now - lastStatsDraw < 250) return;
  lastStatsDraw = now;

  const shots = stats.hits + stats.misses;
  const accuracy = shots ? Math.round((stats.hits / shots) * 100) : 0;
  const average = stats.hits ? stats.totalMs / stats.hits / 1000 : 0;
  const best = stats.bestMs === Infinity ? null : stats.bestMs / 1000;

  statsPanel.rows({
    title: 'Your score',
    rowSize: 0.062,
    rows: [
      ['hits', stats.hits, COLORS.good],
      ['missed', stats.misses, stats.misses ? COLORS.warn : COLORS.inkDim],
      ['accuracy', shots ? `${accuracy}%` : '—'],
      ['average', average ? `${average.toFixed(1)}s` : '—'],
      ['best', best ? `${best.toFixed(1)}s` : '—'],
    ],
  });
}

// ---------------------------------------------------------------- main loop

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;

  for (let i = ctx.targets.length - 1; i >= 0; i--) {
    const target = ctx.targets[i];
    const mover = target.userData.mover;
    if (mover && !target.dead) {
      const moved = mover(elapsed - target.userData.bornAtElapsed);
      place(target, moved.angle ?? target.userData.angle, moved.height ?? target.userData.height);
    }
    if (!target.update(dt)) {
      scene.remove(target);
      target.dispose();
      ctx.targets.splice(i, 1);
      refreshInteractables();
    }
  }

  pointers.update();
  updateDiagrams();
  lesson?.update?.(dt, ctx);
  drawStats();
  diagnostics.systemTrips = systemTrips;
  diagnostics.update();

  renderer.render(scene, camera);
});

// ------------------------------------------------- flat-screen look controls

const look = { dragging: false, didDrag: false, yaw: 0, pitch: 0, last: null };

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  look.dragging = true;
  look.didDrag = false;
  look.last = { x: e.clientX, y: e.clientY };
});

window.addEventListener('pointermove', (e) => {
  if (!look.dragging || renderer.xr.isPresenting) return;
  const dx = e.clientX - look.last.x;
  const dy = e.clientY - look.last.y;
  look.last = { x: e.clientX, y: e.clientY };
  if (Math.hypot(dx, dy) > 1) look.didDrag = true;
  look.yaw -= dx * 0.004;
  look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 0.004, -1.2, 1.2);
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
});

window.addEventListener('pointerup', () => { look.dragging = false; });

// --------------------------------------------------------------- entry points

const overlay = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const enterVRButton = document.getElementById('enter-vr');
const enterDesktopButton = document.getElementById('enter-desktop');

let hintEl = null;
function showHint(text) {
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.id = 'hint';
    document.body.appendChild(hintEl);
  }
  hintEl.innerHTML = text;
  hintEl.hidden = false;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status status--${kind}`;
}

async function checkSupport() {
  if (!navigator.xr) {
    diagnostics.supported = false;
    setStatus('This browser has no WebXR. Open the page in the Meta Quest Browser to use the headset — or try it on this screen below.', 'warn');
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    diagnostics.supported = supported;
    if (supported) {
      setStatus('Headset detected and ready.', 'ok');
      enterVRButton.hidden = false;
    } else {
      setStatus('WebXR is here but no headset is available. You can still practise on this screen.', 'warn');
    }
  } catch (error) {
    diagnostics.supported = false;
    setStatus(`Could not check for a headset: ${error.message}`, 'bad');
  }
}

async function enterVR() {
  resumeAudio();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    session.addEventListener('end', () => {
      overlay.hidden = false;
      if (hintEl) hintEl.hidden = true;
      setStatus('You left VR. Put the headset back on and press start whenever you like.', 'ok');
    });
    watchSystemButtons(session);
    await renderer.xr.setSession(session);
    overlay.hidden = true;
    beginIfNeeded();
  } catch (error) {
    setStatus(`The headset refused to start: ${error.message}`, 'bad');
  }
}

function enterDesktop() {
  resumeAudio();
  overlay.hidden = true;
  beginIfNeeded();
  showHint('<b>Move the mouse</b> to aim &middot; <b>click</b> to shoot &middot; <b>drag</b> to look around');
}

let begun = false;
function beginIfNeeded() {
  if (begun) return;
  begun = true;
  restoreButtons();
  resetStats();
  startLesson(0);
}

enterVRButton.addEventListener('click', enterVR);
enterDesktopButton.addEventListener('click', enterDesktop);

// A window onto the running state, for the browser console and for the smoke
// test in test/. Read-only; nothing in the app depends on it.
window.__debug = {
  get lesson() { return lesson?.id ?? null; },
  get board() { return board; },
  get stats() { return { ...stats, bestMs: stats.bestMs === Infinity ? null : stats.bestMs }; },
  get targets() { return ctx.targets.length; },
  get hovering() { return pointers.all.map((p) => p.hovered?.constructor.name ?? null).find(Boolean) ?? null; },
  get presenting() { return renderer.xr.isPresenting; },
  get systemTrips() { return systemTrips; },
  hands(visible = true) { setHandsVisible(visible); },
  goto(id) {
    const index = LESSONS.findIndex((l) => l.id === id);
    if (index >= 0) startLesson(index);
    return index;
  },
  scene,
  pointers,
};

// Draw something sensible behind the overlay before anyone presses anything.
say({ title: 'Ready', instruction: 'Press the button to begin.', footer: '' });
drawStats();
diagnostics.object3D.visible = true;
checkSupport();
