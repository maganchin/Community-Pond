// A painted pond: background layer, duck layer (ripples, shadows, bodies, feet), accessory layer (hats, halos, labels).
import { paintPond, rng, wash } from './painter.js';
import { duckSprite, footSprite, accessorySprite, SPRITE_UNITS, L, W } from './duckart.js';
import { bottleSprite, drawCork, BU } from './bottleart.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NEW_MS = 24 * 3600 * 1000;
const NOKEYS = new Set();

export class Pond {
  constructor(root, { mini = false, seed = 7, onDuckTap = () => {}, onWaterTap = () => {}, onInteract = () => {}, onBottleTap = () => {}, onBottleCatch = () => {}, onThrow = () => {}, onRodChange = () => {}, onBeachTap = () => {}, onHook = () => {}, onEscape = () => {}, onReel = () => {} } = {}) {
    this.root = root;
    Object.assign(this, { onBottleTap, onBottleCatch, onThrow, onRodChange, onBeachTap, onHook, onEscape, onReel });
    this.bottles = [];
    this.beach = [];
    this.beachG = null;
    this.splashes = [];
    this.aim = null;
    this.rod = mini ? null : { held: false, state: 'cast', hx: 0, hy: 0, tx: 0, ty: 0, hooked: null, ang: null };
    this.mini = mini;
    this.seed = seed;
    this.onDuckTap = onDuckTap;
    this.onWaterTap = onWaterTap;
    this.onInteract = onInteract;
    this.layers = ['bg', 'ducks', 'acc'].map((name) => {
      const c = document.createElement('canvas');
      c.className = `layer layer-${name}`;
      c.setAttribute('aria-hidden', 'true');
      root.appendChild(c);
      return c;
    });
    [this.bg, this.dk, this.ac] = this.layers;
    this.entities = [];
    this.ripples = [];
    this.marks = [];
    this.player = null;
    this.target = null;
    this.keys = new Set();
    this.highlight = null;
    this.nearby = null;
    this.showKeyHint = false;
    this.running = false;
    this.w = this.h = 0;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.resize();
    this.bindPointer();
  }

  resize() {
    const rect = this.root.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (w === this.w && h === this.h) return;
    const ow = this.w, oh = this.h;
    this.w = w; this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const m = Math.min(w, h);
    this.scale = this.mini ? clamp(m / 640, 0.5, 0.8) : clamp(m / 520, 0.72, 1.05);
    if (!this.mini) this.beachG = { cx: 0, cy: h, rx: clamp(w * 0.55, 170, 380), ry: clamp(h * 0.25, 140, 260) };
    for (const o of this.bottles) this.placeBottle(o);
    for (const k of this.beach) this.placeKept(k);
    for (const c of [this.dk, this.ac]) {
      c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr);
    }
    if (ow && oh) for (const e of this.entities) { e.x *= w / ow; e.y *= h / oh; }
    if (this.target && ow) { this.target.x *= w / ow; this.target.y *= h / oh; }
    clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => this.paintBackground(), ow ? 220 : 0);
    for (const e of this.entities) this.refreshSprites(e);
    for (const o of this.bottles) this.bottleSprites(o);
  }

  paintBackground() {
    const bdpr = Math.min(this.dpr, 1.5);
    const W2 = Math.round(this.w * bdpr), H2 = Math.round(this.h * bdpr);
    this.bg.width = W2; this.bg.height = H2;
    const g = this.bg.getContext('2d');
    if (!this.mini) {
      const bg = this.beachG;
      paintPond(g, W2, H2, { seed: this.seed, unit: bdpr, beach: bg && { cx: bg.cx * bdpr, cy: bg.cy * bdpr, rx: bg.rx * bdpr, ry: bg.ry * bdpr } });
    } else {
      const off = document.createElement('canvas');
      off.width = W2; off.height = H2;
      paintPond(off.getContext('2d'), W2, H2, { seed: this.seed, unit: bdpr * 0.8 });
      const path = this.miniShape(W2, H2);
      g.clearRect(0, 0, W2, H2);
      g.save();
      g.beginPath();
      path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.clip();
      g.drawImage(off, 0, 0);
      g.restore();
      // bleeding rim
      g.save();
      g.globalAlpha = 0.18;
      g.strokeStyle = '#2b3f8a';
      for (let i = 0; i < 3; i++) {
        g.lineWidth = (6 - i * 2) * bdpr;
        g.beginPath();
        path.forEach((p, k) => (k ? g.lineTo(p.x + i, p.y - i) : g.moveTo(p.x + i, p.y - i)));
        g.closePath();
        g.stroke();
      }
      g.restore();
    }
  }

  miniShape(w, h) {
    const r = rng(this.seed + 3);
    const pts = [];
    const n = 120;
    const ph = [r() * TAU, r() * TAU, r() * TAU];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = 1 + Math.sin(a * 2 + ph[0]) * 0.035 + Math.sin(a * 3 + ph[1]) * 0.03 + Math.sin(a * 5 + ph[2]) * 0.015;
      pts.push({ x: w / 2 + Math.cos(a) * w * 0.47 * k, y: h / 2 + Math.sin(a) * h * 0.46 * k });
    }
    return pts;
  }

  inside(x, y, margin = 0) {
    if (this.mini) {
      const rx = this.w * 0.44 - margin, ry = this.h * 0.43 - margin;
      const dx = (x - this.w / 2) / rx, dy = (y - this.h / 2) / ry;
      return dx * dx + dy * dy <= 1;
    }
    return x > margin && y > margin && x < this.w - margin && y < this.h - margin && !this.inBeach(x, y, margin);
  }
  inBeach(x, y, m = 0) {
    const g = this.beachG;
    if (!g) return false;
    const dx = (x - g.cx) / (g.rx * 1.08 + m), dy = (y - g.cy) / (g.ry * 1.08 + m);
    return dx * dx + dy * dy < 1;
  }
  outOfBeach(x, y, m = 0) {
    const g = this.beachG;
    if (!this.inBeach(x, y, m)) return { x, y };
    const a = Math.atan2((y - g.cy) / (g.ry * 1.08 + m), (x - g.cx) / (g.rx * 1.08 + m));
    return { x: g.cx + Math.cos(a) * (g.rx * 1.08 + m) * 1.01, y: g.cy + Math.sin(a) * (g.ry * 1.08 + m) * 1.01 };
  }

  refreshSprites(e) {
    const s = this.scale * this.dpr;
    e.sprite = duckSprite(e.duck.color, s, e.duck.id || 1);
    e.foot = footSprite(s);
    e.acc = accessorySprite(e.duck.accessory, s);
  }

  isNew(duck) {
    return !this.mini && !duck.starter && duck.createdAt && Date.now() - duck.createdAt < NEW_MS;
  }

  has(id) { return this.entities.some((e) => e.duck.id === id && e.state !== 'leave'); }
  get(id) { return this.entities.find((e) => e.duck.id === id); }

  add(duck, { from = 'random', player = false } = {}) {
    const r = Math.random;
    const L2 = L * this.scale;
    let x, y, h, state = 'swim', tx, ty;
    const cx = this.w / 2, cy = this.h / 2;
    if (from === 'random') {
      let tries = 0;
      do {
        x = this.w * (0.12 + r() * 0.76);
        y = this.h * (0.12 + r() * 0.76);
        tries++;
      } while (tries < 30 && (!this.inside(x, y, L2) || this.entities.some((o) => Math.hypot(o.x - x, o.y - y) < L2 * 1.5)));
      h = r() * TAU;
    } else {
      // swim in from an edge (or from the bottom for your own duck)
      const side = from === 'bottom' ? 3 : Math.floor(r() * 4);
      const pad = L2 * 1.2;
      if (side === 0) { x = -pad; y = this.h * (0.2 + r() * 0.6); }
      else if (side === 1) { x = this.w + pad; y = this.h * (0.2 + r() * 0.6); }
      else if (side === 2) { x = this.w * (0.2 + r() * 0.6); y = -pad; }
      else { x = from === 'bottom' ? cx : this.w * (0.2 + r() * 0.6); y = this.h + pad; }
      tx = from === 'bottom' ? cx : cx + (r() - 0.5) * this.w * 0.4;
      ty = from === 'bottom' ? this.h * 0.62 : cy + (r() - 0.5) * this.h * 0.4;
      h = Math.atan2(ty - y, tx - x);
      state = 'enter';
    }
    const e = { duck, x, y, h, v: 0, turn: 0, state, tx, ty, phase: r() * TAU, dist: 0, idle: 0, born: performance.now(),
      cruise: (8 + r() * 6), player, sz: Math.min(1.3, Math.max(0.75, Number(duck.size) || 1)) };
    this.refreshSprites(e);
    this.entities.push(e);
    if (player) this.player = e;
    return e;
  }

  remove(id, { leave = true } = {}) {
    const e = this.get(id);
    if (!e) return;
    if (!leave) { this.entities = this.entities.filter((o) => o !== e); if (this.player === e) this.player = null; return; }
    e.state = 'leave';
    const dx = e.x - this.w / 2, dy = e.y - this.h / 2;
    const a = Math.atan2(dy, dx);
    e.tx = this.w / 2 + Math.cos(a) * this.w * 1.2;
    e.ty = this.h / 2 + Math.sin(a) * this.h * 1.2;
    if (this.player === e) this.player = null;
  }

  setPlayer(e) {
    if (this.player) this.player.player = false;
    this.player = e;
    if (e) e.player = true;
  }

  flash(id) { this.highlight = { id, t0: performance.now() }; }

  hitTest(x, y) {
    let best = null, bd = Infinity;
    const rad = Math.max(28, L * this.scale * 0.62);
    for (const e of this.entities) {
      if (e.state === 'leave') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < rad * Math.max(1, e.sz) && d < bd) { best = e; bd = d; }
    }
    return best;
  }

  bindPointer() {
    const el = this.ac;
    let down = null;
    el.addEventListener('pointerdown', (ev) => {
      const p = this.local(ev);
      down = { ...p, t: performance.now(), drag: false, id: ev.pointerId };
      el.setPointerCapture?.(ev.pointerId);
      if (this.rod?.state === 'fight') { this.reel(0.08); return; }
      if (this.rod?.held && !this.hitRod(p)) { this.rod.tx = p.x; this.rod.ty = p.y; }
      if (this.aim) { this.aim.x = p.x; this.aim.y = p.y; }
    });
    el.addEventListener('pointermove', (ev) => {
      const p = this.local(ev);
      const live = ev.pointerType === 'mouse' || (down && ev.pointerId === down.id);
      if (this.aim && live) { this.aim.x = p.x; this.aim.y = p.y; }
      if (this.rod?.held && live && this.rod.state === 'cast') { this.rod.tx = p.x; this.rod.ty = p.y; }
      if (!down || ev.pointerId !== down.id) return;
      if (Math.hypot(p.x - down.x, p.y - down.y) > 14) down.drag = true;
      if (down.drag && this.player && !this.rod?.held && !this.aim) { this.target = p; this.onInteract('drag'); }
    });
    const up = (ev) => {
      if (!down || ev.pointerId !== down.id) return;
      const p = this.local(ev);
      const wasDrag = down.drag;
      down = null;
      if (this.aim) { const a = this.aim; this.aim = null; this.onThrow(p, a); return; }
      if (!wasDrag && !this.rod?.held) { const kh0 = this.hitBeach(p.x, p.y); if (kh0) { this.onBeachTap(kh0.b, kh0); return; } }
      if (this.rod && !wasDrag && this.hitRod(p)) { this.setRod(!this.rod.held); return; }
      if (this.rod?.held) { this.onInteract('fish'); return; }
      if (wasDrag) return;
      const hit = this.hitTest(p.x, p.y);
      if (hit) { this.onDuckTap(hit.duck, hit); return; }
      const kh = this.hitBeach(p.x, p.y);
      if (kh) { this.onBeachTap(kh.b, kh); return; }
      const bh = this.hitBottle(p.x, p.y);
      if (bh) { this.onBottleTap(bh.b, bh); return; }
      if (this.player) {
        this.target = p;
        this.marks.push({ x: p.x, y: p.y, t0: performance.now() });
      }
      this.onWaterTap(p);
      this.onInteract('tap');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { down = null; });
  }

  local(ev) {
    const r = this.ac.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  // ---------- bottles ----------
  bottleSprites(o) { o.sprite = bottleSprite(o.b.paper, this.scale * this.dpr * (this.mini ? 1.15 : 1), o.b.id > 0 ? o.b.id : 1); }
  hasBottle(id) { return this.bottles.some((o) => o.b.id === id && o.state !== 'sink'); }
  getBottle(id) { return this.bottles.find((o) => o.b.id === id); }
  addBottle(b, { from = null } = {}) {
    let ax = b.x, ay = b.y;
    if (this.mini || ax == null) {
      let tries = 0;
      do { ax = 0.2 + Math.random() * 0.6; ay = 0.2 + Math.random() * 0.6; tries++; }
      while (tries < 30 && (!this.inside(ax * this.w, ay * this.h, 30) || this.bottles.some((o) => Math.hypot((o.ax - ax) * this.w, (o.ay - ay) * this.h) < 60)));
    }
    const now = performance.now();
    const o = { b, ax, ay, x: ax * this.w, y: ay * this.h, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 0.12, phase: Math.random() * TAU,
      state: 'float', born: now, t0: now, cool: 0, lift: 0 };
    if (from) { o.state = 'fly'; o.fx = from.x; o.fy = from.y; o.dur = 1100; o.born = now - 2000; }
    this.placeBottle(o);
    o.x = o.ax * this.w; o.y = o.ay * this.h;
    this.bottleSprites(o);
    this.bottles.push(o);
    return o;
  }
  placeBottle(o) {
    if (!this.w || this.mini) return;
    o.ax = o.b.x ?? o.ax; o.ay = o.b.y ?? o.ay;
    const q = this.outOfBeach(o.ax * this.w, o.ay * this.h, 26 * this.scale);
    o.ax = q.x / this.w; o.ay = q.y / this.h;
  }
  // ---------- kept bottles lying on the beach ----------
  placeKept(k) {
    const g = this.beachG;
    if (!g) return;
    const r = rng((k.b.id || 1) * 7 + 3);
    const a = -Math.PI / 2 * (0.1 + r() * 0.8), f = 0.28 + r() * 0.55;
    let x = g.cx + Math.cos(a) * g.rx * f, y = g.cy + Math.sin(a) * g.ry * f;
    if (y > this.h - 78 && x > 44) y = this.h - 78 - r() * 18;
    k.x = x; k.y = y; k.rot = r() * TAU;
  }
  hasKept(id) { return this.beach.some((k) => k.b.id === id); }
  addKept(b, { from = null } = {}) {
    if (this.hasKept(b.id)) return null;
    const k = { b, t0: performance.now(), from };
    this.placeKept(k);
    k.sprite = bottleSprite(b.paper, this.scale * this.dpr, b.id);
    this.beach.push(k);
    return k;
  }
  removeKept(id) { this.beach = this.beach.filter((k) => k.b.id !== id); }
  setBeach(list) {
    const ids = new Set(list.map((b) => b.id));
    this.beach = this.beach.filter((k) => ids.has(k.b.id));
    for (const b of list) this.addKept(b);
  }
  hitBeach(x, y) {
    const R = Math.max(26, 28 * this.scale);
    for (let i = this.beach.length - 1; i >= 0; i--) {
      const k = this.beach[i];
      if (!k.from && Math.hypot(k.x - x, k.y - y) < R) return k;
    }
    return null;
  }
  keepCatch(b) {
    const r = this.rod;
    if (!r?.hooked || r.hooked.b.id !== b.id) { this.addKept(b); return; }
    const o = r.hooked, g = this.rodG;
    this.bottles = this.bottles.filter((x) => x !== o);
    r.hooked = null; r.state = 'cast';
    r.hx = g.tip.x + 30; r.hy = g.tip.y + 20; r.tx = r.hx + 40; r.ty = r.hy;
    this.addKept(b, { from: { x: g.tip.x, y: g.tip.y } });
  }
  tossBack(b) {
    const k = this.beach.find((x) => x.b.id === b.id);
    this.removeKept(b.id);
    if (!this.hasBottle(b.id)) this.addBottle(b, { from: k ? { x: k.x, y: k.y } : null });
  }
  removeBottle(id, { sink = true } = {}) {
    const o = this.getBottle(id);
    if (!o) return;
    if (this.rod?.hooked === o) return;
    if (!sink) { this.bottles = this.bottles.filter((x) => x !== o); return; }
    o.state = 'sink'; o.t0 = performance.now();
  }
  hitBottle(x, y) {
    let best = null, bd = Math.max(28, 26 * this.scale);
    for (const o of this.bottles) {
      if (o.state !== 'float') continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  splash(x, y, big = 1) { this.splashes.push({ x, y, t0: performance.now(), big }); }

  // ---------- fishing rod & throwing ----------
  rodGeom() {
    const r = this.rod;
    const bg = this.beachG;
    const base = { x: bg.rx * 0.2, y: bg.cy - bg.ry * 0.2 };
    const len = clamp(Math.min(this.w, this.h) * 0.42, 150, 300);
    const want = r.held && r.state !== 'cast' ? -1.1 : r.held ? clamp(Math.atan2(r.hy - base.y, r.hx - base.x), -1.5, 0.1) : -0.8;
    r.ang = r.ang == null ? want : r.ang + wrap(want - r.ang) * 0.12;
    return { base, len, tip: { x: base.x + Math.cos(r.ang) * len, y: base.y + Math.sin(r.ang) * len } };
  }
  hitRod(p) {
    if (!this.rod) return false;
    const { base, tip } = this.rodG || this.rodGeom();
    const k = this.rod.held ? 0.6 : 1;
    const ex = base.x + (tip.x - base.x) * k, ey = base.y + (tip.y - base.y) * k;
    const dx = ex - base.x, dy = ey - base.y;
    const t = clamp(((p.x - base.x) * dx + (p.y - base.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const near = Math.hypot(p.x - (base.x + dx * t), p.y - (base.y + dy * t)) < 24;
    return near || (!this.rod.held && Math.hypot(p.x - this.rod.hx, p.y - this.rod.hy) < 24);
  }
  reel(k = 0.1) {
    const r = this.rod;
    if (!r || r.state !== 'fight') return;
    r.pull = Math.min(1, r.pull + k);
    r.lastReel = performance.now();
    this.onReel(r.pull);
  }
  get reelProgress() { return this.rod?.state === 'fight' ? this.rod.pull : null; }

  setRod(held) {
    const r = this.rod;
    if (!r || r.held === held || r.state !== 'cast') return;
    r.held = held;
    const g = this.rodG || this.rodGeom();
    r.hx = g.tip.x + 30; r.hy = g.tip.y + 20; r.tx = r.hx + 40; r.ty = r.hy;
    if (held) { this.target = null; this.aim = null; }
    this.onRodChange(held);
  }
  releaseCatch({ keep = true } = {}) {
    const r = this.rod;
    if (!r || !r.hooked) return;
    const o = r.hooked, g = this.rodG;
    r.hooked = null; r.state = 'cast';
    if (keep) { o.state = 'fly'; o.fx = g.tip.x; o.fy = g.tip.y; o.t0 = performance.now(); o.dur = 1000; o.cool = performance.now() + 4000; }
    else this.bottles = this.bottles.filter((x) => x !== o);
    r.hx = g.tip.x + 30; r.hy = g.tip.y + 20; r.tx = r.hx + 40; r.ty = r.hy;
  }
  startAim(paper) { this.setRod(false); this.aim = { paper, x: this.w / 2, y: this.h * 0.4 }; }
  stopAim() { this.aim = null; }
  aimOrigin() { const p = this.player; return p ? { x: p.x, y: p.y } : { x: this.w / 2, y: this.h - 60 }; }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.step(dt, t);
      this.draw(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  steer(e, angle, rate, dt) {
    const d = wrap(angle - e.h);
    e.h = wrap(e.h + clamp(d, -rate * dt, rate * dt));
  }

  step(dt, now) {
    const S = this.scale;
    const L2 = L * S;
    const cx = this.w / 2, cy = this.h / 2;
    const pk = this.rod?.held || this.aim ? NOKEYS : this.keys;
    for (const e of this.entities) {
      let speed;
      if (e.player) {
        let vx = 0, vy = 0;
        if (pk.has('ArrowLeft')) vx -= 1;
        if (pk.has('ArrowRight')) vx += 1;
        if (pk.has('ArrowUp')) vy -= 1;
        if (pk.has('ArrowDown')) vy += 1;
        if (e.state === 'enter') {
          speed = 64 * S;
          this.steer(e, Math.atan2(e.ty - e.y, e.tx - e.x), 1.2, dt);
          if (Math.hypot(e.tx - e.x, e.ty - e.y) < 12) e.state = 'swim';
        } else if (vx || vy) {
          this.target = null;
          this.steer(e, Math.atan2(vy, vx), 2.8, dt);
          speed = 62 * S;
        } else if (this.target) {
          const d = Math.hypot(this.target.x - e.x, this.target.y - e.y);
          if (d < 6) { this.target = null; speed = 0; }
          else {
            this.steer(e, Math.atan2(this.target.y - e.y, this.target.x - e.x), 2.6, dt);
            speed = Math.min(58 * S, d * 1.1 + 8);
          }
        } else speed = 0;
        e.v += (speed - e.v) * Math.min(1, dt * 2.5);
      } else {
        e.turn += (Math.random() - 0.5) * dt * 1.6;
        e.turn *= 0.985;
        e.turn = clamp(e.turn, -0.4, 0.4);
        e.h = wrap(e.h + e.turn * dt);
        if (e.state === 'enter' || e.state === 'leave') {
          this.steer(e, Math.atan2(e.ty - e.y, e.tx - e.x), 1.0, dt);
          if (e.state === 'enter' && Math.hypot(e.tx - e.x, e.ty - e.y) < 30) e.state = 'swim';
          speed = (e.state === 'leave' ? 22 : 20) * S;
        } else {
          if (!this.inside(e.x, e.y, L2 * 0.9)) this.steer(e, Math.atan2(cy - e.y, cx - e.x), 0.9, dt);
          // gentle personal space
          for (const o of this.entities) {
            if (o === e) continue;
            const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy);
            if (d < L2 * 1.35 && d > 0) this.steer(e, Math.atan2(dy, dx), 0.7 * (1 - d / (L2 * 1.35)), dt);
          }
          speed = e.cruise * S;
          // pause now and then, like floating
          e.idle -= dt;
          if (e.idle < -20 - Math.random() * 30) e.idle = 3 + Math.random() * 4;
          if (e.idle > 0) speed *= 0.15;
        }
        e.v += (speed - e.v) * Math.min(1, dt * 0.8);
      }
      e.x += Math.cos(e.h) * e.v * dt;
      e.y += Math.sin(e.h) * e.v * dt;
      if (e.player && e.state === 'swim') {
        const m = L2 * 0.45;
        if (this.mini) { if (!this.inside(e.x, e.y, m)) { e.x += (cx - e.x) * 0.02; e.y += (cy - e.y) * 0.02; } }
        else { e.x = clamp(e.x, m, this.w - m); e.y = clamp(e.y, m, this.h - m); const q = this.outOfBeach(e.x, e.y, m); e.x = q.x; e.y = q.y; }
      }
      e.phase += dt * (1.2 + e.v * 0.12);
      e.dist += e.v * dt;
      if (e.dist > 15 * S && e.v > 2) {
        e.dist = 0;
        this.ripples.push({ x: e.x - Math.cos(e.h) * L2 * 0.42, y: e.y - Math.sin(e.h) * L2 * 0.42, h: e.h, t0: now, seed: Math.random() * 100, life: 4200 + Math.random() * 1200, k: clamp(e.v / (20 * S), 0.6, 1.4) });
      }
    }
    // remove ducks that left
    this.entities = this.entities.filter((e) => !(e.state === 'leave' && (Math.abs(e.x - cx) > this.w / 2 + L2 * 1.5 || Math.abs(e.y - cy) > this.h / 2 + L2 * 1.5)));
    this.ripples = this.ripples.filter((r) => now - r.t0 < r.life);
    if (this.ripples.length > 500) this.ripples.splice(0, this.ripples.length - 500);
    this.marks = this.marks.filter((m) => now - m.t0 < 1200);
    // bottles
    for (const o of this.bottles) {
      if (o.state === 'fly') {
        const t = clamp((now - o.t0) / o.dur, 0, 1);
        o.x = o.fx + (o.ax * this.w - o.fx) * t; o.y = o.fy + (o.ay * this.h - o.fy) * t;
        o.lift = Math.sin(Math.PI * t);
        o.rot += dt * 6;
        if (t >= 1) { o.state = 'float'; o.lift = 0; this.splash(o.x, o.y, 1.4); }
      } else if (o.state === 'float') {
        const tt = now / 1000;
        o.x = o.ax * this.w + Math.sin(tt * 0.35 + o.phase) * 7 * S;
        o.y = o.ay * this.h + Math.cos(tt * 0.28 + o.phase * 1.3) * 5 * S;
        o.rot += o.spin * dt;
      }
    }
    this.bottles = this.bottles.filter((o) => !(o.state === 'sink' && now - o.t0 > 1400));
    this.splashes = this.splashes.filter((s) => now - s.t0 < 2600);
    const r = this.rod;
    if (r) {
      this.rodG = this.rodGeom();
      const g = this.rodG;
      if (!r.held) { r.hx = g.tip.x + 6; r.hy = g.tip.y + 26 * S; }
      else if (r.state === 'cast') {
        let kx = 0, ky = 0;
        if (this.keys.has('ArrowLeft')) kx -= 1;
        if (this.keys.has('ArrowRight')) kx += 1;
        if (this.keys.has('ArrowUp')) ky -= 1;
        if (this.keys.has('ArrowDown')) ky += 1;
        if (kx || ky) { r.tx = clamp(r.tx + kx * 170 * S * dt, 10, this.w - 10); r.ty = clamp(r.ty + ky * 170 * S * dt, 10, this.h - 10); }
        const ox = r.hx, oy = r.hy;
        r.hx += (r.tx - r.hx) * Math.min(1, dt * 4);
        r.hy += (r.ty - r.hy) * Math.min(1, dt * 4);
        r.trail = (r.trail || 0) + Math.hypot(r.hx - ox, r.hy - oy);
        if (r.trail > 16 * S) {
          r.trail = 0;
          this.ripples.push({ x: r.hx, y: r.hy, h: Math.atan2(r.hy - oy, r.hx - ox), t0: now, seed: Math.random() * 100, life: 3000, k: 0.7 });
        }
        for (const o of this.bottles) {
          if (o.state !== 'float' || now < o.cool) continue;
          const dist = Math.hypot(o.x - r.hx, o.y - r.hy);
          if (o === r.escaped) { if (dist > 70 * S) r.escaped = null; else continue; }
          if (dist < 24 * S + 6) {
            r.hooked = o; r.state = 'fight'; r.pull = 0; r.t0 = now; r.lastReel = now; r.fx = r.hx; r.fy = r.hy; o.state = 'hooked';
            this.splash(o.x, o.y, 1);
            this.onHook(o.b);
            break;
          }
        }
      } else if (r.state === 'fight') {
        const o = r.hooked;
        if (r.pull < 1) r.pull = Math.max(0, r.pull - dt * 0.06);
        const e = r.pull * r.pull * (3 - 2 * r.pull), tug = Math.sin(now / 110) * Math.sin(now / 470) * 5 * S * (1 - r.pull * 0.6);
        const gx = r.fx + (g.tip.x + 18 - r.fx) * e, gy = r.fy + (g.tip.y + 26 * S - r.fy) * e;
        const ox = r.hx, oy = r.hy;
        r.hx += (gx - r.hx) * Math.min(1, dt * 6) + tug * dt * 6; r.hy += (gy - r.hy) * Math.min(1, dt * 6) - tug * dt * 3;
        o.x = r.hx; o.y = r.hy + 4 * S; o.rot += Math.sin(now / 200) * dt;
        r.trail = (r.trail || 0) + Math.hypot(r.hx - ox, r.hy - oy) + Math.abs(tug) * dt;
        if (r.trail > 10 * S) { r.trail = 0; this.ripples.push({ x: r.hx, y: r.hy, h: Math.random() * TAU, t0: now, seed: Math.random() * 100, life: 2600, k: 0.8 }); }
        if (r.pull >= 1) { r.state = 'reel'; r.t0 = now; r.dur = 600; r.fx = r.hx; r.fy = r.hy; }
        else if (now - r.lastReel > 7000 && r.pull < 0.2) {
          r.hooked = null; r.state = 'cast'; r.tx = r.hx; r.ty = r.hy; r.escaped = o;
          o.state = 'float'; o.cool = now + 3000; o.ax = o.x / this.w; o.ay = o.y / this.h;
          this.splash(o.x, o.y, 1);
          this.onEscape(o.b);
        }
      } else if (r.state === 'reel') {
        const t = clamp((now - r.t0) / (r.dur || 1500), 0, 1), e = t * t * (3 - 2 * t);
        const ox = r.hx, oy = r.hy;
        r.hx = r.fx + (g.tip.x + 18 - r.fx) * e; r.hy = r.fy + (g.tip.y + 26 * S - r.fy) * e;
        const o = r.hooked;
        o.x = r.hx; o.y = r.hy + 4 * S; o.rot += dt * 1.5;
        o.lift = t > 0.8 ? (t - 0.8) * 2.5 : 0;
        r.trail = (r.trail || 0) + Math.hypot(r.hx - ox, r.hy - oy);
        if (r.trail > 14 * S && t < 0.8) { r.trail = 0; this.ripples.push({ x: r.hx, y: r.hy, h: Math.atan2(r.hy - oy, r.hx - ox), t0: now, seed: Math.random() * 100, life: 3000, k: 1 }); }
        if (t >= 1) { r.state = 'landed'; o.state = 'held'; this.onBottleCatch(o.b, o); }
      }
    }
    // nearest duck to the player (for keyboard reading)
    this.nearby = null;
    if (this.player) {
      let bd = L2 * 1.7;
      for (const e of this.entities) {
        if (e === this.player || e.state === 'leave') continue;
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < bd) { bd = d; this.nearby = e; }
      }
    }
  }

  draw(now) {
    const S = this.scale, d = this.dpr;
    const size = SPRITE_UNITS * S;
    const g = this.dk.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    // pencil ripple arcs
    g.lineCap = 'round';
    for (const r of this.ripples) {
      const a = (now - r.t0) / r.life;
      const alpha = 0.5 * Math.pow(1 - a, 1.6) * Math.min(1, a * 8);
      g.strokeStyle = `rgba(24,38,98,${alpha.toFixed(3)})`;
      for (let k = 0; k < 2; k++) {
        const rad = (7 + a * 26 * r.k) * S * (1 + k * 0.5);
        const span = 0.85 - k * 0.12;
        g.lineWidth = (1.25 - k * 0.3) * Math.min(1.2, S + 0.2);
        g.beginPath();
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const t = -span + (i / steps) * span * 2;
          const ang = r.h + Math.PI + t;
          const wob = 1 + Math.sin(t * 5 + r.seed + k) * 0.06;
          const x = r.x + Math.cos(ang) * rad * wob, y = r.y + Math.sin(ang) * rad * wob;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    // halos under new ducks
    for (const e of this.entities) {
      if (!this.isNew(e.duck)) continue;
      const pulse = 0.75 + Math.sin(now / 900 + e.phase) * 0.25;
      const R = L * S * 1.05;
      const grd = g.createRadialGradient(e.x, e.y, R * 0.2, e.x, e.y, R);
      grd.addColorStop(0, `rgba(255,246,205,${(0.75 * pulse).toFixed(3)})`);
      grd.addColorStop(0.6, `rgba(255,232,160,${(0.35 * pulse).toFixed(3)})`);
      grd.addColorStop(1, 'rgba(255,232,160,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(e.x, e.y, R, 0, TAU);
      g.fill();
    }
    for (const sp of this.splashes) {
      const a = (now - sp.t0) / 2600;
      for (let k = 0; k < 3; k++) {
        const rad = (6 + a * 40 * sp.big) * S * (1 + k * 0.35);
        g.strokeStyle = `rgba(24,38,98,${(0.45 * (1 - a) * (1 - k * 0.25)).toFixed(3)})`;
        g.lineWidth = 1.2 - k * 0.25;
        g.beginPath();
        g.ellipse(sp.x, sp.y, rad, rad * 0.8, 0, 0.2 + k, TAU - 0.5 + k);
        g.stroke();
      }
    }
    const bs = BU * S * (this.mini ? 1.15 : 1);
    for (const k of this.beach) {
      let x = k.x, y = k.y, lift = 0;
      if (k.from) {
        const t = clamp((now - k.t0) / 1100, 0, 1);
        x = k.from.x + (k.x - k.from.x) * t; y = k.from.y + (k.y - k.from.y) * t; lift = Math.sin(Math.PI * t);
        if (t >= 1) k.from = null;
      }
      g.save();
      g.fillStyle = 'rgba(90,70,40,0.22)';
      g.beginPath(); g.ellipse(x + 3, y + 4, bs * 0.34, bs * 0.15, k.rot, 0, TAU); g.fill();
      g.translate(x, y - lift * 80 * S);
      g.rotate(k.rot + lift * 4);
      g.drawImage(k.sprite.canvas, -bs * 0.5, -bs * 0.5, bs, bs);
      g.restore();
    }
    for (const o of this.bottles) {
      if (o.state === 'held') continue;
      const fade = o.state === 'sink' ? 1 - (now - o.t0) / 1400 : clamp((now - o.born) / 1200, 0, 1);
      const lift = o.lift || 0;
      g.save();
      g.globalAlpha = clamp(fade, 0, 1);
      if (o.state === 'float' && this.isNew(o.b)) {
        const R = bs * 0.75, pulse = 0.75 + Math.sin(now / 900 + o.phase) * 0.25;
        const grd = g.createRadialGradient(o.x, o.y, R * 0.15, o.x, o.y, R);
        grd.addColorStop(0, `rgba(255,246,205,${(0.7 * pulse).toFixed(3)})`);
        grd.addColorStop(1, 'rgba(255,232,160,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(o.x, o.y, R, 0, TAU); g.fill();
      }
      if (lift < 0.05) {
        g.strokeStyle = 'rgba(24,38,98,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(o.x, o.y, bs * 0.4, bs * 0.22, o.rot, 0.3 + Math.sin(now / 700 + o.phase) * 0.2, TAU - 0.7); g.stroke();
      } else {
        g.fillStyle = `rgba(20,34,90,${(0.16 * (1 - lift * 0.5)).toFixed(3)})`;
        g.beginPath(); g.ellipse(o.x, o.y, bs * 0.3, bs * 0.14, o.rot, 0, TAU); g.fill();
      }
      g.translate(o.x, o.y - lift * 70 * S);
      g.rotate(o.rot);
      const sc = 1 + lift * 0.35;
      g.scale(sc, sc);
      g.drawImage(o.sprite.canvas, -bs / 2, -bs / 2, bs, bs);
      g.restore();
    }
    // feet then bodies
    for (const e of this.entities) {
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.h + Math.PI / 2);
      g.scale(e.sz, e.sz);
      const kick = clamp(e.v / (12 * S), 0, 1);
      [-1, 1].forEach((side, i) => {
        g.save();
        g.translate(side * (W / 2 - 7) * S, 9 * S);
        g.scale(side, 1);
        g.rotate(0.55 + Math.sin(e.phase * 2.2 + i * Math.PI) * 0.45 * kick);
        g.drawImage(e.foot.canvas, -size / 2, -size / 2, size, size);
        g.restore();
      });
      g.drawImage(e.sprite.canvas, -size / 2, -size / 2, size, size);
      g.restore();
    }

    // accessory layer
    const a = this.ac.getContext('2d');
    a.setTransform(d, 0, 0, d, 0, 0);
    a.clearRect(0, 0, this.w, this.h);
    for (const m of this.marks) {
      const t = (now - m.t0) / 1200;
      a.strokeStyle = `rgba(24,38,98,${(0.6 * (1 - t)).toFixed(3)})`;
      a.lineWidth = 1.2;
      a.beginPath();
      a.arc(m.x, m.y, 6 + t * 16, 0, TAU);
      a.stroke();
    }
    for (const e of this.entities) {
      if (!e.acc) continue;
      a.save();
      a.translate(e.x, e.y);
      a.rotate(e.h + Math.PI / 2);
      a.scale(e.sz, e.sz);
      a.drawImage(e.acc.canvas, -size / 2, -size / 2, size, size);
      a.restore();
    }
    a.font = `${Math.round(15 + S * 2)}px "Patrick Hand", "Comic Sans MS", cursive`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    const tag = (x, y, text, ink, paper) => {
      const tw = a.measureText(text).width + 12;
      x = clamp(x, tw / 2 + 4, Math.max(tw / 2 + 4, this.w - tw / 2 - 4));
      a.fillStyle = paper;
      a.beginPath();
      a.roundRect ? a.roundRect(x - tw / 2, y - 11, tw, 22, 9) : a.rect(x - tw / 2, y - 11, tw, 22);
      a.fill();
      a.strokeStyle = ink; a.globalAlpha = 0.5; a.lineWidth = 1; a.stroke(); a.globalAlpha = 1;
      a.fillStyle = ink;
      a.fillText(text, x, y + 1);
    };
    for (const e of this.entities) {
      const off = L * S * 0.78 * e.sz;
      if (e.player && !this.mini) tag(e.x, e.y + off, e.duck.name ? `you · ${e.duck.name}` : 'you', '#26315a', 'rgba(246,238,219,0.92)');
      else {
        if (e.duck.name) tag(e.x, e.y + off, e.duck.name, '#26315a', 'rgba(246,238,219,0.8)');
        if (this.isNew(e.duck)) tag(e.x, e.y - off, 'new', '#7a4b12', 'rgba(255,244,206,0.95)');
      }
    }
    for (const o of this.bottles) if (o.state === 'float' && this.isNew(o.b)) tag(o.x, o.y - bs * 0.48, 'new', '#7a4b12', 'rgba(255,244,206,0.95)');
    if (this.rod && this.rodG) {
      const { base, tip } = this.rodG, r = this.rod;
      a.strokeStyle = 'rgba(30,32,48,0.75)'; a.lineWidth = 1;
      a.beginPath(); a.moveTo(tip.x, tip.y);
      a.quadraticCurveTo((tip.x + r.hx) / 2, Math.max(tip.y, r.hy) + (r.state === 'reel' || r.state === 'fight' ? 4 : 18) * S, r.hx, r.hy);
      a.stroke();
      const dx = tip.x - base.x, dy = tip.y - base.y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
      const seg = (t0, t1, w0, w1, fill) => {
        const x0 = base.x + dx * t0, y0 = base.y + dy * t0, x1 = base.x + dx * t1, y1 = base.y + dy * t1;
        a.beginPath();
        a.moveTo(x0 + nx * w0, y0 + ny * w0); a.lineTo(x1 + nx * w1, y1 + ny * w1);
        a.lineTo(x1 - nx * w1, y1 - ny * w1); a.lineTo(x0 - nx * w0, y0 - ny * w0); a.closePath();
        a.fillStyle = fill; a.fill();
        a.strokeStyle = 'rgba(29,42,92,0.55)'; a.lineWidth = 0.9; a.stroke();
      };
      seg(0, 1, 4.5 * S + 1, 1.1, '#7a5230');
      seg(0, 0.24, 6.5 * S + 1, 5.5 * S + 1, '#c99b66');
      const rx = base.x + dx * 0.3 + nx * 7 * S, ry = base.y + dy * 0.3 + ny * 7 * S;
      a.fillStyle = '#a4adb6'; a.beginPath(); a.arc(rx, ry, 7 * S, 0, TAU); a.fill();
      a.strokeStyle = 'rgba(29,42,92,0.6)'; a.stroke();
      a.beginPath(); a.arc(rx, ry, 3 * S, 0, TAU); a.stroke();
      const br = 5 * S + 1.5;
      a.fillStyle = '#f6eedb'; a.beginPath(); a.arc(r.hx, r.hy, br, 0, TAU); a.fill();
      a.fillStyle = '#d4553d'; a.beginPath(); a.arc(r.hx, r.hy, br, Math.PI, TAU); a.fill();
      a.strokeStyle = 'rgba(29,42,92,0.7)'; a.lineWidth = 1; a.beginPath(); a.arc(r.hx, r.hy, br, 0, TAU); a.stroke();
      if (!r.held) tag(base.x + dx * 0.8 - nx * 18, base.y + dy * 0.8 - ny * 18, 'fishing rod', '#26315a', 'rgba(246,238,219,0.92)');
      else if (r.state === 'cast') { a.strokeStyle = 'rgba(38,49,90,0.35)'; a.setLineDash([4, 5]); a.beginPath(); a.arc(r.hx, r.hy, 24 * S + 6, 0, TAU); a.stroke(); a.setLineDash([]); }
    }
    if (this.aim) {
      const o = this.aimOrigin(), p = this.aim;
      a.setLineDash([6, 7]); a.strokeStyle = 'rgba(38,49,90,0.75)'; a.lineWidth = 2;
      const my = Math.min(o.y, p.y) - Math.hypot(p.x - o.x, p.y - o.y) * 0.35 - 20;
      a.beginPath(); a.moveTo(o.x, o.y - 20 * S); a.quadraticCurveTo((o.x + p.x) / 2, my, p.x, p.y); a.stroke();
      a.setLineDash([]);
      a.beginPath(); a.ellipse(p.x, p.y, 18 * S, 12 * S, 0, 0, TAU); a.stroke();
      const spr = bottleSprite(p.paper, S * d, 1), bw = BU * S;
      a.save(); a.translate(o.x, o.y - 30 * S); a.rotate(-0.7 + Math.sin(now / 300) * 0.15);
      a.drawImage(spr.canvas, -bw / 2, -bw / 2, bw, bw); a.restore();
    }
    // highlight ring (e.g. after "find new ducks" or your release)
    if (this.highlight) {
      const e = this.get(this.highlight.id);
      const t = (now - this.highlight.t0) / 1000;
      if (!e || t > 9) this.highlight = null;
      else {
        const R = L * S * (0.85 + Math.sin(t * 2.2) * 0.06);
        a.strokeStyle = `rgba(122,75,18,${(0.8 * Math.min(1, (9 - t) / 2)).toFixed(3)})`;
        a.lineWidth = 2;
        a.setLineDash([7, 6]);
        a.beginPath();
        a.arc(e.x, e.y, R, 0, TAU);
        a.stroke();
        a.setLineDash([]);
      }
    }
    if (this.nearby && this.showKeyHint) {
      const e = this.nearby;
      a.strokeStyle = 'rgba(38,49,90,0.55)';
      a.lineWidth = 1.4;
      a.beginPath();
      a.arc(e.x, e.y, L * S * 0.72, 0, TAU);
      a.stroke();
      tag(e.x, e.y + L * S * 0.95, 'press Enter to read', '#26315a', 'rgba(246,238,219,0.92)');
    }
  }

  destroy() { this.stop(); this.ro.disconnect(); this.root.innerHTML = ''; }
}

// small static preview used in the maker and on cards
export function drawDuckPortrait(canvas, duck, { heading = -Math.PI / 2, phase = 0, background = true } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 120, cssH = canvas.clientHeight || 120;
  if (canvas.width !== Math.round(cssW * dpr)) { canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (background) {
    if (!canvas._bg || canvas._bg.width !== canvas.width) {
      const b = document.createElement('canvas');
      b.width = canvas.width; b.height = canvas.height;
      const bg = b.getContext('2d');
      const r = rng(21);
      bg.save();
      bg.beginPath();
      bg.ellipse(b.width / 2, b.height / 2, b.width * 0.48, b.height * 0.46, 0, 0, TAU);
      bg.clip();
      bg.fillStyle = '#a9c6e8';
      bg.fillRect(0, 0, b.width, b.height);
      wash(bg, b.width * 0.2, b.height * 0.8, b.width * 0.4, '#3753a8', r, { layers: 14, alpha: 0.05 });
      wash(bg, b.width * 0.85, b.height * 0.2, b.width * 0.35, '#2d4797', r, { layers: 14, alpha: 0.05 });
      wash(bg, b.width * 0.5, b.height * 0.5, b.width * 0.3, '#d6e6f5', r, { layers: 10, alpha: 0.06 });
      bg.restore();
      canvas._bg = b;
    }
    g.drawImage(canvas._bg, 0, 0);
  }
  if (!duck) return;
  const m = Math.min(cssW, cssH);
  const S = m / 105;
  const size = SPRITE_UNITS * S;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(cssW / 2, cssH / 2 + 4 * S);
  g.rotate(heading + Math.PI / 2);
  const foot = footSprite(S * dpr), body = duckSprite(duck.color, S * dpr, duck.id || 1), acc = accessorySprite(duck.accessory, S * dpr);
  [-1, 1].forEach((side, i) => {
    g.save();
    g.translate(side * (W / 2 - 7) * S, 9 * S);
    g.scale(side, 1);
    g.rotate(0.55 + Math.sin(phase * 2.2 + i * Math.PI) * 0.4);
    g.drawImage(foot.canvas, -size / 2, -size / 2, size, size);
    g.restore();
  });
  g.drawImage(body.canvas, -size / 2, -size / 2, size, size);
  if (acc) g.drawImage(acc.canvas, -size / 2, -size / 2, size, size);
}

export function drawBottlePortrait(canvas, b, { t = 0, pop = -1 } = {}) {
  drawDuckPortrait(canvas, null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 120, cssH = canvas.clientHeight || 120;
  const S = Math.min(cssW, cssH) / 50, size = BU * S;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(cssW / 2, cssH / 2 + Math.sin(t * 2) * 2);
  g.rotate(-0.5 + Math.sin(t) * 0.12);
  g.drawImage(bottleSprite(b.paper, S * dpr, b.id > 0 ? b.id : 1, pop < 0).canvas, -size / 2, -size / 2, size, size);
  if (pop >= 0 && pop < 1) {
    const k = size / BU;
    g.save();
    g.scale(k, k);
    g.globalAlpha = 1 - Math.max(0, pop - 0.6) / 0.4;
    g.translate(22, 0); g.rotate(pop * 7); g.translate(-22, 0);
    drawCork(g, pop * 26, -pop * 34 + pop * pop * 14);
    g.restore();
  }
}
