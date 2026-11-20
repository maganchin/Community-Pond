// A painted pond: background layer, duck layer (ripples, shadows, bodies, feet), accessory layer (hats, halos, labels).
import { paintPond, rng, wash } from './painter.js';
import { duckSprite, footSprite, accessorySprite, SPRITE_UNITS, L, W } from './duckart.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NEW_MS = 24 * 3600 * 1000;

export class Pond {
  constructor(root, { mini = false, seed = 7, onDuckTap = () => {}, onWaterTap = () => {}, onInteract = () => {} } = {}) {
    this.root = root;
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
    for (const c of [this.dk, this.ac]) {
      c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr);
    }
    if (ow && oh) for (const e of this.entities) { e.x *= w / ow; e.y *= h / oh; }
    if (this.target && ow) { this.target.x *= w / ow; this.target.y *= h / oh; }
    clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => this.paintBackground(), ow ? 220 : 0);
    for (const e of this.entities) this.refreshSprites(e);
  }

  paintBackground() {
    const bdpr = Math.min(this.dpr, 1.5);
    const W2 = Math.round(this.w * bdpr), H2 = Math.round(this.h * bdpr);
    this.bg.width = W2; this.bg.height = H2;
    const g = this.bg.getContext('2d');
    if (!this.mini) {
      paintPond(g, W2, H2, { seed: this.seed, unit: bdpr });
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
    return x > margin && y > margin && x < this.w - margin && y < this.h - margin;
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
      cruise: (8 + r() * 6), player };
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
      if (d < rad && d < bd) { best = e; bd = d; }
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
    });
    el.addEventListener('pointermove', (ev) => {
      if (!down || ev.pointerId !== down.id) return;
      const p = this.local(ev);
      if (Math.hypot(p.x - down.x, p.y - down.y) > 14) down.drag = true;
      if (down.drag && this.player) { this.target = p; this.onInteract('drag'); }
    });
    const up = (ev) => {
      if (!down || ev.pointerId !== down.id) return;
      const p = this.local(ev);
      const wasDrag = down.drag;
      down = null;
      if (wasDrag) return;
      const hit = this.hitTest(p.x, p.y);
      if (hit) { this.onDuckTap(hit.duck, hit); return; }
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
    for (const e of this.entities) {
      let speed;
      if (e.player) {
        let vx = 0, vy = 0;
        if (this.keys.has('ArrowLeft')) vx -= 1;
        if (this.keys.has('ArrowRight')) vx += 1;
        if (this.keys.has('ArrowUp')) vy -= 1;
        if (this.keys.has('ArrowDown')) vy += 1;
        if (e.state === 'enter') {
          speed = 26 * S;
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
        else { e.x = clamp(e.x, m, this.w - m); e.y = clamp(e.y, m, this.h - m); }
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
    // feet then bodies
    for (const e of this.entities) {
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.h + Math.PI / 2);
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
      a.drawImage(e.acc.canvas, -size / 2, -size / 2, size, size);
      a.restore();
    }
    a.font = `${Math.round(15 + S * 2)}px "Patrick Hand", "Comic Sans MS", cursive`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    const tag = (x, y, text, ink, paper) => {
      const tw = a.measureText(text).width + 12;
      a.fillStyle = paper;
      a.beginPath();
      a.roundRect ? a.roundRect(x - tw / 2, y - 11, tw, 22, 9) : a.rect(x - tw / 2, y - 11, tw, 22);
      a.fill();
      a.strokeStyle = ink; a.globalAlpha = 0.5; a.lineWidth = 1; a.stroke(); a.globalAlpha = 1;
      a.fillStyle = ink;
      a.fillText(text, x, y + 1);
    };
    for (const e of this.entities) {
      const off = L * S * 0.78;
      if (e.player && !this.mini) tag(e.x, e.y + off, 'you', '#26315a', 'rgba(246,238,219,0.92)');
      else if (this.isNew(e.duck)) tag(e.x, e.y - off, 'new', '#7a4b12', 'rgba(255,244,206,0.95)');
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
