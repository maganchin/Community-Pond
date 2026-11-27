// Painted glass bottle with a rolled letter inside, drawn pointing along +x.
import { rng } from './painter.js';

export const PAPERS = {
  cream: { name: 'Cream', paper: '#f4e8c8' },
  rose: { name: 'Rose', paper: '#f2d2cc' },
  mint: { name: 'Mint', paper: '#d9e9cf' },
  sky: { name: 'Sky', paper: '#d4e2f3' },
};
export const BU = 64;
const cache = new Map();

function glassPath(r) {
  const j = () => (r() - 0.5) * 0.9;
  const p = new Path2D();
  p.moveTo(-18 + j(), -8.5 + j());
  p.bezierCurveTo(-22.5, -7, -22.5, 7, -18 + j(), 8.5 + j());
  p.lineTo(7 + j(), 8.6 + j());
  p.bezierCurveTo(12, 8.4, 13.5, 5, 15.5, 3.8);
  p.lineTo(20 + j(), 3.4);
  p.lineTo(20 + j(), -3.4);
  p.lineTo(15.5, -3.8);
  p.bezierCurveTo(13.5, -5, 12, -8.4, 7 + j(), -8.6 + j());
  p.closePath();
  return p;
}

export function bottleSprite(paper, scale, seed = 1, corked = true) {
  const key = `${paper}|${scale.toFixed(2)}|${seed % 6}|${corked ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const px = Math.max(8, Math.ceil(BU * scale));
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.scale(px / BU, px / BU);
  g.translate(BU / 2, BU / 2);
  const r = rng(seed * 31 + 7);
  const glass = glassPath(r);
  // soft wet edge around the bottle
  g.fillStyle = 'rgba(40,70,120,0.12)';
  g.save(); g.translate(1.5, 2); g.scale(1.06, 1.12); g.fill(glass); g.restore();
  // glass body
  g.fillStyle = 'rgba(196,228,218,0.62)';
  g.fill(glass);
  g.save();
  g.clip(glass);
  // rolled letter
  const col = (PAPERS[paper] || PAPERS.cream).paper;
  g.fillStyle = col;
  g.beginPath();
  g.roundRect ? g.roundRect(-15, -4.6, 22, 9.2, 3.5) : g.rect(-15, -4.6, 22, 9.2);
  g.fill();
  g.strokeStyle = 'rgba(120,90,50,0.45)'; g.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-13 + i * 0.8, -4 + i * 2.6); g.lineTo(5, -4 + i * 2.6 + (r() - 0.5)); g.stroke(); }
  g.fillStyle = '#b5483a';
  g.fillRect(-5, -4.8, 2.2, 9.6);
  // glass shading and watercolor blooms
  g.fillStyle = 'rgba(40,96,110,0.22)';
  g.fillRect(-24, 3.5, 46, 8);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(${90 + r() * 40 | 0},${150 + r() * 40 | 0},${150 + r() * 30 | 0},0.12)`;
    g.beginPath(); g.ellipse(-16 + r() * 30, -6 + r() * 12, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // highlight streak
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-16, -5.6); g.quadraticCurveTo(-4, -7, 8, -6.4); g.stroke();
  g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(13.5, -2.6); g.lineTo(18, -2.4); g.stroke();
  if (corked) drawCork(g, 0, 0, r);
  else { r(); r(); r(); r(); r(); r(); r(); r(); }
  // imperfect pencil outline, drawn twice
  g.strokeStyle = 'rgba(29,42,92,0.55)';
  g.lineWidth = 0.9;
  g.stroke(glass);
  g.save(); g.translate(0.4, -0.3); g.globalAlpha = 0.5; g.stroke(glassPath(r)); g.restore();
  if (corked) { g.strokeStyle = 'rgba(70,40,20,0.6)'; g.lineWidth = 0.7; g.strokeRect(19, -3.6, 6.5, 7.2); }
  const out = { canvas: c };
  cache.set(key, out);
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  return out;
}

// Cork in bottle units (the sprite is BU wide); dx/dy shift it for the pop animation.
export function drawCork(g, dx = 0, dy = 0, r = rng(5)) {
  g.save();
  g.translate(dx, dy);
  g.fillStyle = '#b8895a';
  g.beginPath(); g.roundRect ? g.roundRect(19, -3.6, 6.5, 7.2, 1.6) : g.rect(19, -3.6, 6.5, 7.2); g.fill();
  g.fillStyle = 'rgba(90,55,25,0.5)';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(20.5 + r() * 4, -2.2 + r() * 4.4, 0.45, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(70,40,20,0.6)'; g.lineWidth = 0.7;
  g.strokeRect(19, -3.6, 6.5, 7.2);
  g.restore();
}
