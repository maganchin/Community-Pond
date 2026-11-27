// Soft garden-pond ambience synthesized with Web Audio: trickling water, birds, bees, crickets, frogs, splashes.
const KEY = 'duckpond.sound';
let ctx = null, master = null, noise = null, timers = [];
let enabled = localStorage.getItem(KEY) !== 'off';
const rand = (a, b) => a + Math.random() * (b - a);

function noiseBuffer() {
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  return buf;
}

function loop(filterType, freq, q, gain, lfoRate, lfoDepth) {
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
  const lg = ctx.createGain(); lg.gain.value = lfoDepth;
  lfo.connect(lg).connect(g.gain);
  src.connect(f).connect(g).connect(master);
  src.start(0, rand(0, 3)); lfo.start();
}

function chirp() {
  const t = ctx.currentTime, notes = Math.floor(rand(2, 5)), base = rand(2400, 3800);
  for (let i = 0; i < notes; i++) {
    const s = t + i * rand(0.09, 0.16), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(base * rand(0.9, 1.1), s);
    o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.5), s + 0.06);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.035, s + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
    o.connect(g).connect(master); o.start(s); o.stop(s + 0.1);
  }
}

function ribbit() {
  const t = ctx.currentTime, f = rand(120, 190);
  for (let k = 0; k < 2; k++) {
    const s = t + k * 0.22, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, s); o.frequency.linearRampToValueAtTime(f * 0.8, s + 0.15);
    lp.type = 'lowpass'; lp.frequency.value = 700;
    g.gain.setValueAtTime(0, s);
    for (let p = 0; p < 6; p++) { g.gain.linearRampToValueAtTime(0.05, s + p * 0.025 + 0.008); g.gain.linearRampToValueAtTime(0.005, s + p * 0.025 + 0.022); }
    g.gain.linearRampToValueAtTime(0, s + 0.17);
    o.connect(lp).connect(g).connect(master); o.start(s); o.stop(s + 0.2);
  }
}

function warble() {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  const base = rand(1800, 2600), dur = rand(0.6, 1.1);
  o.type = 'sine'; o.frequency.setValueAtTime(base, t);
  o.frequency.linearRampToValueAtTime(base * rand(1.15, 1.35), t + dur * 0.5);
  o.frequency.linearRampToValueAtTime(base * rand(0.9, 1.05), t + dur);
  lfo.frequency.value = rand(18, 28); lg.gain.value = base * 0.06;
  lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.05);
  g.gain.setValueAtTime(0.025, t + dur - 0.15); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
}

function bee() {
  const t = ctx.currentTime, dur = rand(2.5, 4.5), o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  const vib = ctx.createOscillator(), vg = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const f = rand(190, 240);
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * rand(0.92, 1.1), t + dur);
  vib.frequency.value = rand(5, 9); vg.gain.value = 6; vib.connect(vg).connect(o.frequency);
  lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
  let out = g;
  if (pan) { const a = rand(-0.8, 0.8); pan.pan.setValueAtTime(a, t); pan.pan.linearRampToValueAtTime(-a * 0.6, t + dur); g.connect(pan); out = pan; }
  o.connect(lp).connect(g); out.connect(master);
  o.start(t); vib.start(t); o.stop(t + dur); vib.stop(t + dur);
}

function crickets() {
  const t = ctx.currentTime, f = rand(4200, 5200), trills = Math.floor(rand(3, 7));
  for (let k = 0; k < trills; k++) {
    const s = t + k * rand(0.35, 0.5), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, s);
    for (let p = 0; p < 4; p++) { g.gain.linearRampToValueAtTime(0.012, s + p * 0.03 + 0.008); g.gain.linearRampToValueAtTime(0, s + p * 0.03 + 0.022); }
    o.connect(g).connect(master); o.start(s); o.stop(s + 0.14);
  }
}

function schedule(fn, min, max) {
  const id = setTimeout(() => { if (ctx && ctx.state === 'running') fn(); schedule(fn, min, max); }, rand(min, max));
  timers.push(id);
}

function start() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    noise = noiseBuffer();
    loop('lowpass', 520, 0.7, 0.07, 0.2, 0.03);  // quiet water trickle
    schedule(chirp, 2500, 7000);
    schedule(warble, 6000, 14000);
    schedule(bee, 5000, 13000);
    schedule(crickets, 7000, 16000);
    schedule(ribbit, 14000, 30000);
  }
  ctx.resume();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);
}

function stop() {
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
  setTimeout(() => { if (!enabled) ctx.suspend(); }, 450);
}

export const sound = {
  get on() { return enabled; },
  wake() { if (enabled && (!ctx || ctx.state !== 'running')) start(); },
  toggle() {
    if (enabled && (!ctx || ctx.state !== 'running')) { start(); return true; }
    enabled = !enabled;
    localStorage.setItem(KEY, enabled ? 'on' : 'off');
    enabled ? start() : stop();
    return enabled;
  },
  splash(size = 1) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * size, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f).connect(g).connect(master); src.start(t, rand(0, 3)); src.stop(t + 0.7);
  },
};

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else if (enabled) ctx.resume();
});
