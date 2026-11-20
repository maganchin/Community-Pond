const TAU = Math.PI * 2;
// Procedural watercolor painting: pond washes, lily pads, pencil spirals, paper grain.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => (r() + r() + r() - 1.5) / 1.5;

function deform(points, depth, variance, r) {
  let pts = points;
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push(a);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const v = (a.v + b.v) / 2;
      next.push({ x: (a.x + b.x) / 2 + gauss(r) * len * variance * v, y: (a.y + b.y) / 2 + gauss(r) * len * variance * v, v: v * (0.6 + r() * 0.8) });
    }
    pts = next;
  }
  return pts;
}
function polygon(cx, cy, rad, n, r, squash = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.75 + r() * 0.45);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * squash, v: 0.5 + r() });
  }
  return pts;
}
function fillPts(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}
// Tyler Hobbs style layered watercolor blob
export function wash(ctx, cx, cy, rad, color, r, { layers = 22, alpha = 0.045, squash = 1, spread = 0.9 } = {}) {
  const base = deform(polygon(cx, cy, rad, 10, r, squash), 2, 0.55 * spread, r);
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let l = 0; l < layers; l++) fillPts(ctx, deform(base, 3, 0.38 * spread, r));
  ctx.restore();
}
export function pencilLine(ctx, pts, { color = '#1d2a5c', width = 1.3, alpha = 0.6, r, gaps = 0 }) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = alpha * (pass ? 0.45 : 1);
    ctx.lineWidth = width * (pass ? 0.7 : 1);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const jx = (r() - 0.5) * width * 0.9, jy = (r() - 0.5) * width * 0.9;
      if (gaps && r() < gaps) { pen = false; continue; }
      if (!pen) { ctx.moveTo(p.x + jx, p.y + jy); pen = true; } else ctx.lineTo(p.x + jx, p.y + jy);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function spiral(ctx, cx, cy, R, r, color, scale) {
  const pts = [];
  const turns = 2.2 + r() * 1.2;
  const start = r() * Math.PI * 2;
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    const rad = R * (0.08 + 0.92 * t) * (1 + Math.sin(a * 3 + start) * 0.04);
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * 0.9 });
  }
  pencilLine(ctx, pts, { color, width: 1.4 * scale, alpha: 0.55, r, gaps: 0.012 });
}
function lilyPad(ctx, cx, cy, R, r, scale, outward = null) {
  const notch = outward === null ? r() * Math.PI * 2 : outward + (r() - 0.5) * 1.6;
  const half = 0.2 + r() * 0.12;
  const shape = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = notch + half + (i / n) * (Math.PI * 2 - half * 2);
    const rr = R * (0.94 + Math.sin(a * 5 + R) * 0.03 + r() * 0.04);
    shape.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  const inner = { x: cx + Math.cos(notch) * R * 0.08, y: cy + Math.sin(notch) * R * 0.08 };
  const closed = [...shape, inner];
  // stem first, curling away
  const stem = [];
  let sx = cx, sy = cy, sa = notch + (r() - 0.5) * 0.4;
  const len = R * (1.4 + r() * 1.6);
  const curl = (r() > 0.5 ? 1 : -1) * (0.03 + r() * 0.05);
  for (let i = 0; i < 40; i++) {
    stem.push({ x: sx, y: sy });
    sa += curl + Math.sin(i * 0.25) * 0.02;
    sx += Math.cos(sa) * len / 40; sy += Math.sin(sa) * len / 40;
  }
  pencilLine(ctx, stem, { color: '#1a2b18', width: 2.6 * scale, alpha: 0.75, r });
  // watercolor fill
  ctx.save();
  ctx.beginPath();
  closed.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#4f6a2c';
  ctx.globalAlpha = 0.85;
  ctx.fill();
  wash(ctx, cx - R * 0.15, cy - R * 0.1, R * 0.9, '#6f8a3a', r, { layers: 12, alpha: 0.08 });
  wash(ctx, cx + R * 0.1, cy + R * 0.15, R * 0.6, '#2c4420', r, { layers: 14, alpha: 0.09 });
  wash(ctx, cx, cy, R * 0.35, '#223a1b', r, { layers: 10, alpha: 0.1 });
  ctx.restore();
  // soft halo bleed around pad
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#2f4a2a';
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  closed.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  pencilLine(ctx, closed.concat([closed[0]]).map((p) => ({ x: p.x + (r() - 0.5), y: p.y + (r() - 0.5) })), { color: '#172414', width: 2.1 * scale, alpha: 0.85, r, gaps: 0.03 });
  // veins
  const veins = 6 + Math.floor(r() * 4);
  for (let v = 0; v < veins; v++) {
    const a = notch + half + 0.25 + (v / (veins - 1)) * (Math.PI * 2 - half * 2 - 0.5);
    const pts = [];
    const bend = (r() - 0.5) * 0.3;
    for (let i = 0; i <= 10; i++) {
      const t = 0.12 + (i / 10) * 0.75;
      const aa = a + bend * t;
      pts.push({ x: cx + Math.cos(aa) * R * t, y: cy + Math.sin(aa) * R * t });
    }
    pencilLine(ctx, pts, { color: '#1c2d18', width: 1 * scale, alpha: 0.55, r, gaps: 0.05 });
  }
}
let grainTile = null;
export function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  const r = rng(77);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    const light = v > 0.5;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 30;
    img.data[i + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 38);
  }
  g.putImageData(img, 0, 0);
  // paper fibers
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,40,0.06)';
    g.lineWidth = 0.6;
    g.beginPath();
    const x = r() * 256, y = r() * 256, a = r() * Math.PI;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6 + 2, x + Math.cos(a) * 12, y + Math.sin(a) * 12);
    g.stroke();
  }
  grainTile = c;
  return c;
}
export function applyGrain(ctx, w, h, strength = 1) {
  ctx.save();
  ctx.globalAlpha = 0.9 * strength;
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Paint the full pond into ctx (w,h in device pixels). `unit` scales line widths.
export function paintPond(ctx, w, h, { seed = 7, unit = 1, pads = true, beach = null } = {}) {
  const r = rng(seed);
  const m = Math.min(w, h), M = Math.max(w, h);
  // 1) soft washes painted at low resolution and scaled up so the pigment edges bleed
  const k = 1 / 7;
  const sw = Math.max(8, Math.round(w * k)), sh = Math.max(8, Math.round(h * k));
  const soft = document.createElement('canvas');
  soft.width = sw; soft.height = sh;
  const s = soft.getContext('2d');
  const sm = Math.min(sw, sh);
  s.fillStyle = '#8aaad2';
  s.fillRect(0, 0, sw, sh);
  const g = s.createRadialGradient(sw / 2, sh / 2, sm * 0.05, sw / 2, sh / 2, Math.max(sw, sh) * 0.6);
  g.addColorStop(0, 'rgba(200,222,243,0.95)');
  g.addColorStop(0.5, 'rgba(165,195,230,0.55)');
  g.addColorStop(1, 'rgba(120,150,205,0)');
  s.fillStyle = g;
  s.fillRect(0, 0, sw, sh);
  for (let i = 0; i < 12; i++) wash(s, r() * sw, r() * sh, sm * (0.1 + r() * 0.14), r() > 0.5 ? '#7598cb' : '#aac6e7', r, { layers: 12, alpha: 0.06 });
  const indigos = ['#2d4797', '#3753a8', '#22337c', '#4562b4', '#1f2d6e'];
  const edgeCount = Math.round(18 + ((w + h) / m) * 8);
  const spots = [];
  for (let i = 0; i < edgeCount; i++) {
    const side = Math.floor(r() * 4);
    const t = r();
    const inset = Math.pow(r(), 1.8) * sm * 0.2;
    let x, y;
    if (side === 0) { x = inset; y = t * sh; } else if (side === 1) { x = sw - inset; y = t * sh; } else if (side === 2) { x = t * sw; y = inset; } else { x = t * sw; y = sh - inset; }
    if (sw < sh && side >= 2 && r() < 0.4) continue;
    spots.push([x, y]);
    wash(s, x, y, sm * (0.08 + r() * 0.15), indigos[Math.floor(r() * indigos.length)], r, { layers: 14, alpha: 0.07 });
  }
  [[0, 0], [sw, 0], [0, sh], [sw, sh]].forEach(([x, y]) => wash(s, x, y, sm * (0.2 + r() * 0.1), '#22367f', r, { layers: 14, alpha: 0.07 }));
  for (let i = 0; i < 3; i++) wash(s, sw * (0.25 + r() * 0.5), sh * (0.2 + r() * 0.6), sm * (0.05 + r() * 0.05), '#6088c8', r, { layers: 10, alpha: 0.06 });
  wash(s, sw / 2, sh / 2, sm * 0.26, '#c6ddf3', r, { layers: 12, alpha: 0.06, squash: sh > sw ? 1.5 : 0.75 });
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, w, h);
  ctx.restore();
  // 2) a few crisper, transparent washes on top for watercolor edge rims
  for (let i = 0; i < Math.round(edgeCount * 0.45); i++) {
    const [x, y] = spots[Math.floor(r() * spots.length)] || [0, 0];
    wash(ctx, x / k + (r() - 0.5) * m * 0.1, y / k + (r() - 0.5) * m * 0.1, m * (0.05 + r() * 0.1), indigos[Math.floor(r() * indigos.length)], r, { layers: 8, alpha: 0.035 });
  }
  for (let i = 0; i < 6; i++) wash(ctx, w * (0.15 + r() * 0.7), h * (0.15 + r() * 0.7), m * (0.05 + r() * 0.08), '#e3eefa', r, { layers: 8, alpha: 0.035 });
  // pigment granulation speckles, mostly in the darker edges
  ctx.save();
  for (let i = 0; i < (w * h) / 700; i++) {
    const x = r() * w, y = r() * h;
    const edge = Math.min(x, w - x, y, h - y) / m;
    if (r() < edge * 2.5) continue;
    ctx.fillStyle = r() > 0.45 ? 'rgba(22,36,105,0.12)' : 'rgba(235,245,255,0.10)';
    ctx.fillRect(x, y, 1.3 * unit, 1.3 * unit);
  }
  ctx.restore();
  // pencil spirals
  const spirals = Math.round(4 + ((w * h) / (m * m)) * 2);
  for (let i = 0; i < spirals; i++) {
    const x = w * (0.08 + r() * 0.84), y = h * (0.06 + r() * 0.88);
    spiral(ctx, x, y, m * (0.045 + r() * 0.045), r, r() > 0.4 ? '#1b2a66' : '#203a74', unit);
  }
  // lily pads around the sides, some partly offscreen
  if (pads) {
    const count = Math.round(4 + ((w + h) / m) * 1.2);
    const R0 = Math.max(26 * unit, Math.min(m * 0.085, 80 * unit));
    for (let i = 0; i < count; i++) {
      const left = i % 2 === 0;
      const y = h * ((i + 0.5 + (r() - 0.5) * 0.6) / count);
      const R = R0 * (0.75 + r() * 0.5);
      const off = r() < 0.4 ? -R * (0.2 + r() * 0.35) : R * (0.4 + r() * 1.2);
      const x = left ? off : w - off;
      lilyPad(ctx, x, y, R, r, unit, left ? Math.PI : 0);
    }
    if (w > h) {
      lilyPad(ctx, w * (0.3 + r() * 0.4), -R0 * 0.3, R0, r, unit, -Math.PI / 2);
      lilyPad(ctx, w * (0.2 + r() * 0.6), h + R0 * 0.25, R0 * 0.9, r, unit, Math.PI / 2);
    }
  }
  if (beach) paintBeach(ctx, beach, r, unit);
  applyGrain(ctx, w, h);
}

export function beachPath(b, seed = 5, k = 1) {
  const r = rng(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU];
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const a = -Math.PI / 2 - 0.15 + (i / 60) * (Math.PI / 2 + 0.3);
    const wob = 1 + Math.sin(a * 5 + ph[0]) * 0.04 + Math.sin(a * 9 + ph[1]) * 0.025 + Math.sin(a * 17 + ph[2]) * 0.012;
    pts.push({ x: b.cx + Math.cos(a) * b.rx * wob * k, y: b.cy + Math.sin(a) * b.ry * wob * k });
  }
  return pts;
}
function paintBeach(ctx, b, r, unit) {
  const trace = (pts) => {
    ctx.beginPath();
    ctx.moveTo(b.cx - 4, b.cy + 4);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
  };
  // wet sand rim, then dry sand
  ctx.save();
  ctx.globalAlpha = 0.45; ctx.fillStyle = '#9c8a64';
  trace(beachPath(b, 5, 1.07)); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = '#e3cb98';
  trace(beachPath(b, 5, 1)); ctx.fill();
  trace(beachPath(b, 5, 1)); ctx.clip();
  const m = Math.min(b.rx, b.ry);
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 * r(), f = r();
    wash(ctx, b.cx + Math.cos(a) * b.rx * f, b.cy + Math.sin(a) * b.ry * f, m * (0.15 + r() * 0.25), r() > 0.5 ? '#d2b27a' : '#f3e4bd', r, { layers: 10, alpha: 0.06 });
  }
  wash(ctx, b.cx + b.rx * 0.6, b.cy - b.ry * 0.6, m * 0.25, '#b99c68', r, { layers: 8, alpha: 0.05 });
  for (let i = 0; i < (b.rx * b.ry) / 90; i++) {
    const a = -Math.PI / 2 * r(), f = Math.sqrt(r());
    ctx.fillStyle = r() > 0.5 ? 'rgba(120,90,50,0.22)' : 'rgba(255,250,235,0.35)';
    ctx.fillRect(b.cx + Math.cos(a) * b.rx * f, b.cy + Math.sin(a) * b.ry * f, 1.4 * unit, 1.4 * unit);
  }
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 * (0.1 + r() * 0.8), f = 0.2 + r() * 0.7, s = (3 + r() * 5) * unit;
    const x = b.cx + Math.cos(a) * b.rx * f, y = b.cy + Math.sin(a) * b.ry * f;
    ctx.fillStyle = ['#b5ab9b', '#c9bfae', '#9f968a'][i % 3];
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, r() * TAU, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(70,60,45,0.45)'; ctx.lineWidth = 0.8 * unit; ctx.stroke();
  }
  ctx.restore();
  // foam and pencil shoreline
  pencilLine(ctx, beachPath(b, 5, 1.1), { color: '#f7fbff', width: 2.2 * unit, alpha: 0.55, r, gaps: 0.15 });
  pencilLine(ctx, beachPath(b, 5, 1.0), { color: '#5d4a30', width: 1.3 * unit, alpha: 0.55, r });
  pencilLine(ctx, beachPath(b, 5, 1.15), { color: '#f4f8ff', width: 1.4 * unit, alpha: 0.35, r, gaps: 0.35 });
}

// Cream paper texture as a data URL for cards and panels
export function paperDataURL() {
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  const g = c.getContext('2d');
  const r = rng(11);
  g.fillStyle = '#f6eedb';
  g.fillRect(0, 0, 320, 320);
  for (let i = 0; i < 10; i++) wash(g, r() * 320, r() * 320, 60 + r() * 80, r() > 0.5 ? '#efe2c4' : '#fbf6ea', r, { layers: 10, alpha: 0.06 });
  applyGrain(g, 320, 320, 0.6);
  return c.toDataURL('image/png');
}
