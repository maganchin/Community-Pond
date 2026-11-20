// Top-down painted ducks. Body, feet and accessories are separate sprites so they can be layered.
import { rng, pencilLine } from './painter.js';

export const COLORS = {
  cream: { name: 'Cream', body: '#fbf8ef', shade: '#cfd6e4', light: '#ffffff', line: '#7f879c' },
  butter: { name: 'Butter', body: '#f5d98a', shade: '#d5ad55', light: '#fff1c2', line: '#94712f' },
  blush: { name: 'Blush', body: '#f2c1bf', shade: '#d39497', light: '#fde2de', line: '#9b5f64' },
  sage: { name: 'Sage', body: '#bdd0a3', shade: '#8ea573', light: '#e0eacf', line: '#5b6d47' },
  lavender: { name: 'Lavender', body: '#cdbfe6', shade: '#a190c6', light: '#e9e0f7', line: '#6a5a91' },
  terracotta: { name: 'Clay', body: '#e2a27e', shade: '#bd7452', light: '#f4c6a8', line: '#844a30' },
  mist: { name: 'Mist', body: '#cad3dc', shade: '#99a7b6', light: '#e8edf2', line: '#5f6c79' },
  charcoal: { name: 'Charcoal', body: '#62636b', shade: '#45464d', light: '#83848c', line: '#2a2b30' },
};
export const ACCESSORIES = {
  none: 'No accessory',
  daisy: 'Daisy crown',
  bow: 'Ribbon bow',
  sunhat: 'Straw sun hat',
  scarf: 'Knit scarf',
  lilyleaf: 'Lily leaf cap',
  beanie: 'Wool beanie',
};

// Geometry in duck units: facing up (-y). Body length 64.
export const L = 64, W = 46;
export const HEAD = { x: 0, y: -L / 2 - 4, r: 11.5 };
const SPRITE = 120; // sprite box in units, centered on body center
const BEAK = '#f39a2b', BEAK_DARK = '#c86d17';

function bodyPath(r) {
  const pts = [];
  const n = 90;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const s = Math.sin(t), c = Math.cos(t);
    let rx = (W / 2) * (1 - 0.14 * Math.max(0, -s));
    let x = rx * c, y = (L / 2) * s;
    const tail = Math.exp(-Math.pow(t - Math.PI / 2, 2) / 0.03);
    y += tail * 6;
    x *= 1 - tail * 0.25;
    const wob = 1 + (r() - 0.5) * 0.025 + Math.sin(t * 7) * 0.008;
    pts.push({ x: x * wob, y: y * wob });
  }
  return pts;
}
function circlePts(cx, cy, rad, r, n = 40) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + (r() - 0.5) * 0.05;
    pts.push({ x: cx + Math.cos(a) * rad * w, y: cy + Math.sin(a) * rad * w });
  }
  return pts;
}
function trace(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}
function paintFluffy(ctx, pts, col, r, lightX, lightY, size) {
  // base
  ctx.fillStyle = col.body;
  trace(ctx, pts);
  ctx.fill();
  ctx.save();
  trace(ctx, pts);
  ctx.clip();
  // soft shading
  const g = ctx.createRadialGradient(lightX, lightY, size * 0.05, lightX + size * 0.15, lightY + size * 0.25, size * 1.05);
  g.addColorStop(0, col.light);
  g.addColorStop(0.55, col.body);
  g.addColorStop(1, col.shade);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = g;
  ctx.fillRect(-SPRITE, -SPRITE, SPRITE * 2, SPRITE * 2);
  // colored pencil hatching
  ctx.lineCap = 'round';
  for (let i = 0; i < size * 3; i++) {
    const x = (r() - 0.5) * size * 2.2, y = (r() - 0.5) * size * 2.4;
    const dark = x + y > size * 0.2 ? r() < 0.7 : r() < 0.2;
    ctx.strokeStyle = dark ? col.shade : col.light;
    ctx.globalAlpha = dark ? 0.22 : 0.35;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3 + r() * 3, y - 2 - r() * 3);
    ctx.stroke();
  }
  ctx.restore();
  // chalky fuzzy edge
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const nx = q.y - p.y, ny = -(q.x - p.x);
    const nl = Math.hypot(nx, ny) || 1;
    for (let k = 0; k < 2; k++) {
      const t = r();
      const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
      const out = 0.4 + r() * 1.1;
      ctx.strokeStyle = r() < 0.5 ? col.body : col.light;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - (nx / nl) * 0.8, y - (ny / nl) * 0.8);
      ctx.lineTo(x + (nx / nl) * out, y + (ny / nl) * out);
      ctx.stroke();
    }
  }
  ctx.restore();
  pencilLine(ctx, pts.concat([pts[0]]), { color: col.line, width: 0.9, alpha: 0.45, r, gaps: 0.08 });
}

function makeCanvas(scale) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(SPRITE * scale);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.scale(scale, scale);
  return { c, g };
}

const cache = new Map();
export function duckSprite(color, scale, seed = 1) {
  const key = `b:${color}:${scale.toFixed(2)}:${seed % 5}`;
  if (cache.has(key)) return cache.get(key);
  const col = COLORS[color] || COLORS.cream;
  const r = rng(seed % 5 + 3);
  const { c, g } = makeCanvas(scale);
  // soft shadow in water
  g.save();
  g.fillStyle = 'rgba(20,35,90,0.13)';
  g.beginPath();
  g.ellipse(3, 4, W / 2 + 2, L / 2 + 3, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const body = bodyPath(r);
  paintFluffy(g, body, col, r, -W * 0.18, -L * 0.15, L / 2);
  // folded wing lines
  [-1, 1].forEach((s) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push({ x: s * (W * 0.32 - t * 4), y: -L * 0.12 + t * L * 0.5 });
    }
    pencilLine(g, pts, { color: col.shade, width: 0.9, alpha: 0.5, r, gaps: 0.1 });
  });
  // beak (under head so head overlaps its base)
  g.save();
  g.fillStyle = BEAK;
  g.beginPath();
  g.moveTo(-4.2, HEAD.y - HEAD.r + 3);
  g.quadraticCurveTo(-3.5, HEAD.y - HEAD.r - 6, 0, HEAD.y - HEAD.r - 7.5);
  g.quadraticCurveTo(3.5, HEAD.y - HEAD.r - 6, 4.2, HEAD.y - HEAD.r + 3);
  g.closePath();
  g.fill();
  g.globalAlpha = 0.35;
  g.fillStyle = '#ffd08a';
  g.beginPath();
  g.ellipse(-1.2, HEAD.y - HEAD.r - 3, 1.2, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  pencilLine(g, [{ x: -4, y: HEAD.y - HEAD.r + 1 }, { x: -3, y: HEAD.y - HEAD.r - 5 }, { x: 0, y: HEAD.y - HEAD.r - 7.4 }, { x: 3, y: HEAD.y - HEAD.r - 5 }, { x: 4, y: HEAD.y - HEAD.r + 1 }], { color: BEAK_DARK, width: 0.8, alpha: 0.7, r });
  // head
  const head = circlePts(HEAD.x, HEAD.y, HEAD.r, r);
  paintFluffy(g, head, col, r, HEAD.x - 4, HEAD.y - 4, HEAD.r);
  // eyes
  g.fillStyle = color === 'charcoal' ? '#f4efe2' : '#1d1d24';
  [-1, 1].forEach((s) => {
    g.beginPath();
    g.ellipse(s * 5.6, HEAD.y - 4.2, 1.25, 1.45, 0, 0, Math.PI * 2);
    g.fill();
  });
  const out = { canvas: c, scale };
  cache.set(key, out);
  return out;
}

export function footSprite(scale) {
  const key = `f:${scale.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const r = rng(5);
  const { c, g } = makeCanvas(scale);
  // webbed foot pointing right (+x) from origin
  g.fillStyle = '#f49a33';
  g.beginPath();
  g.moveTo(0, -1.5);
  g.lineTo(6, -2);
  g.quadraticCurveTo(10, -6, 13, -5);
  g.quadraticCurveTo(12.5, -2, 14.5, 0);
  g.quadraticCurveTo(12.5, 2, 13, 5);
  g.quadraticCurveTo(10, 6, 6, 2);
  g.lineTo(0, 1.5);
  g.closePath();
  g.fill();
  pencilLine(g, [{ x: 0, y: -1.5 }, { x: 6, y: -2 }, { x: 10, y: -5.6 }, { x: 13, y: -5 }, { x: 14.5, y: 0 }, { x: 13, y: 5 }, { x: 10, y: 5.6 }, { x: 6, y: 2 }, { x: 0, y: 1.5 }], { color: '#c4661a', width: 0.7, alpha: 0.6, r });
  const out = { canvas: c, scale };
  cache.set(key, out);
  return out;
}

function daisy(g, x, y, s, r) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.3;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = '#fffdf6';
    g.beginPath();
    g.ellipse(s * 1.1, 0, s * 1.05, s * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,120,150,0.5)';
    g.lineWidth = 0.4;
    g.stroke();
    g.restore();
  }
  g.fillStyle = '#f1bd2c';
  g.beginPath();
  g.arc(x, y, s * 0.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(190,120,20,0.6)';
  g.beginPath();
  g.arc(x + s * 0.15, y + s * 0.15, s * 0.3, 0, Math.PI * 2);
  g.fill();
}

export function accessorySprite(kind, scale) {
  if (!kind || kind === 'none') return null;
  const key = `a:${kind}:${scale.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const r = rng(kind.length * 31);
  const { c, g } = makeCanvas(scale);
  const hx = HEAD.x, hy = HEAD.y, hr = HEAD.r;
  if (kind === 'daisy') {
    // leafy ring + flowers on the crown of the head
    const ring = [];
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI * 0.15 + (i / 30) * Math.PI * 1.7;
      ring.push({ x: hx + Math.cos(a + Math.PI / 2) * (hr - 1.5), y: hy + Math.sin(a + Math.PI / 2) * (hr - 1.5) });
    }
    pencilLine(g, ring, { color: '#4d6b2b', width: 1.8, alpha: 0.85, r });
    daisy(g, hx - 7, hy + 4, 2.7, r);
    daisy(g, hx + 7.5, hy + 3, 2.4, r);
    daisy(g, hx, hy + 9, 3, r);
  } else if (kind === 'bow') {
    const by = hy + hr + 2;
    g.fillStyle = '#d6524b';
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.moveTo(0, by);
      g.quadraticCurveTo(s * 9, by - 9, s * 12, by - 1);
      g.quadraticCurveTo(s * 11, by + 7, 0, by);
      g.fill();
      g.fillStyle = 'rgba(255,190,170,0.5)';
      g.beginPath();
      g.ellipse(s * 6, by - 2.5, 2.5, 1.2, s * -0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d6524b';
      g.beginPath();
      g.moveTo(s * 1, by + 1);
      g.lineTo(s * 6, by + 11);
      g.lineTo(s * 3, by + 10);
      g.closePath();
      g.fill();
    });
    g.fillStyle = '#a93a36';
    g.beginPath();
    g.ellipse(0, by, 2.6, 2.2, 0, 0, Math.PI * 2);
    g.fill();
    pencilLine(g, [{ x: 0, y: by }, { x: 9, y: by - 8 }, { x: 12, y: by - 1 }, { x: 11, y: by + 6 }, { x: 0, y: by }, { x: -9, y: by - 8 }, { x: -12, y: by - 1 }, { x: -11, y: by + 6 }, { x: 0, y: by }], { color: '#7c2a26', width: 0.7, alpha: 0.6, r, gaps: 0.1 });
  } else if (kind === 'sunhat') {
    const cy = hy + 1.5;
    const brim = circlePts(hx, cy, hr + 6.5, r, 50);
    g.fillStyle = '#e9cb84';
    trace(g, brim);
    g.fill();
    g.save();
    trace(g, brim);
    g.clip();
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = r() * (hr + 6);
      g.strokeStyle = r() > 0.5 ? 'rgba(170,125,50,0.35)' : 'rgba(255,240,200,0.5)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(hx + Math.cos(a) * d, cy + Math.sin(a) * d);
      g.lineTo(hx + Math.cos(a + 0.25) * d, cy + Math.sin(a + 0.25) * d);
      g.stroke();
    }
    g.restore();
    pencilLine(g, brim.concat([brim[0]]), { color: '#8f6a2a', width: 0.8, alpha: 0.6, r, gaps: 0.06 });
    g.strokeStyle = '#c4553d';
    g.lineWidth = 2.6;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(hx, cy, hr - 3, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = '#f1d99a';
    g.beginPath();
    g.arc(hx - 0.5, cy - 0.5, hr - 4.4, 0, Math.PI * 2);
    g.fill();
    daisy(g, hx + hr - 2, cy + 3, 2, r);
  } else if (kind === 'scarf') {
    const ny = hy + hr - 1;
    g.lineCap = 'round';
    g.strokeStyle = '#c64e4b';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-10, ny + 1);
    g.quadraticCurveTo(0, ny + 6, 10, ny + 1);
    g.stroke();
    // trailing tail along the back
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(6, ny + 3);
    g.quadraticCurveTo(11, ny + 12, 8, ny + 22);
    g.stroke();
    g.strokeStyle = '#f2e5c9';
    g.lineWidth = 1.2;
    [0.3, 0.6].forEach((t) => {
      g.beginPath();
      g.moveTo(5 + t * 7, ny + 4 + t * 16);
      g.lineTo(10 + t * 2, ny + 4 + t * 16);
      g.stroke();
    });
    [-6, -1, 4].forEach((x) => {
      g.beginPath();
      g.moveTo(x, ny + 0.5);
      g.lineTo(x + 1, ny + 5);
      g.stroke();
    });
    pencilLine(g, [{ x: -11, y: ny - 1 }, { x: 0, y: ny + 3.5 }, { x: 11, y: ny - 1 }], { color: '#7f2826', width: 0.6, alpha: 0.6, r });
  } else if (kind === 'lilyleaf') {
    const R = hr + 1.5;
    const notch = Math.PI / 2;
    const pts = [{ x: hx, y: hy + 1 }];
    for (let i = 0; i <= 30; i++) {
      const a = notch + 0.3 + (i / 30) * (Math.PI * 2 - 0.6);
      pts.push({ x: hx + Math.cos(a) * R, y: hy + 1 + Math.sin(a) * R });
    }
    g.fillStyle = '#5c7a31';
    trace(g, pts);
    g.fill();
    g.fillStyle = 'rgba(35,60,25,0.35)';
    g.beginPath();
    g.arc(hx + 2, hy + 3, R * 0.55, 0, Math.PI * 2);
    g.fill();
    for (let v = 0; v < 7; v++) {
      const a = notch + 0.5 + (v / 6) * (Math.PI * 2 - 1);
      pencilLine(g, [{ x: hx, y: hy + 1 }, { x: hx + Math.cos(a) * R * 0.85, y: hy + 1 + Math.sin(a) * R * 0.85 }], { color: '#1f3218', width: 0.5, alpha: 0.6, r });
    }
    pencilLine(g, pts.concat([pts[0]]), { color: '#1b2b15', width: 0.9, alpha: 0.75, r });
  } else if (kind === 'beanie') {
    const cap = circlePts(hx, hy + 1, hr + 0.8, r, 40);
    g.fillStyle = '#5b78bb';
    trace(g, cap);
    g.fill();
    g.save();
    trace(g, cap);
    g.clip();
    g.strokeStyle = 'rgba(30,45,100,0.45)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.beginPath();
      g.moveTo(hx, hy + 1);
      g.lineTo(hx + Math.cos(a) * (hr + 2), hy + 1 + Math.sin(a) * (hr + 2));
      g.stroke();
    }
    g.strokeStyle = '#3f5b9b';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(hx, hy + 1, hr - 0.8, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    g.fillStyle = '#f4ecd8';
    g.beginPath();
    g.arc(hx, hy + 1, 4, 0, Math.PI * 2);
    g.fill();
    pencilLine(g, circlePts(hx, hy + 1, 4, r, 16).concat([]), { color: '#a99f88', width: 0.5, alpha: 0.6, r });
    pencilLine(g, cap.concat([cap[0]]), { color: '#2a3b6b', width: 0.8, alpha: 0.6, r, gaps: 0.05 });
  }
  const out = { canvas: c, scale };
  cache.set(key, out);
  return out;
}

export const SPRITE_UNITS = SPRITE;
