// Small WebAudio beeper. Browsers only allow audio after a user gesture, so
// `resume()` is called from the first click / trigger pull.

let ctx = null;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function resume() {
  const c = context();
  if (c && c.state === 'suspended') c.resume();
}

function tone(freq, duration, { type = 'sine', gain = 0.14, slideTo = null } = {}) {
  const c = context();
  if (!c || c.state !== 'running') return;

  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);

  amp.gain.setValueAtTime(0.0001, c.currentTime);
  amp.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);

  osc.connect(amp).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration + 0.02);
}

export const sfx = {
  hover: () => tone(520, 0.06, { gain: 0.05 }),
  hit: () => tone(660, 0.18, { slideTo: 1320, gain: 0.16 }),
  miss: () => tone(180, 0.22, { type: 'square', gain: 0.07, slideTo: 120 }),
  lessonDone: () => {
    tone(660, 0.16);
    setTimeout(() => tone(880, 0.16), 130);
    setTimeout(() => tone(1180, 0.3), 260);
  },
  click: () => tone(880, 0.07, { gain: 0.1 }),
};
