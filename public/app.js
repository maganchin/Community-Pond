import { Pond, drawDuckPortrait, drawBottlePortrait } from './pond.js';
import { PAPERS } from './bottleart.js';
import { COLORS, ACCESSORIES } from './duckart.js';
import { paperDataURL } from './painter.js';
import { sound } from './sounds.js';

const $ = (id) => document.getElementById(id);
const MAX_LETTER = 280;
const NEW_MS = 24 * 3600 * 1000;
const STORE = 'duckpond.v1';

// ---------- local storage (My Pond lives in this browser) ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
const store = Object.assign({ visitor: '', saved: [], released: [], reported: [], hintSeen: false, tossed: [], reportedBottles: [] }, load());
store.saved = store.saved.filter((d) => d.kind === 'bottle');
if (!store.visitor) store.visitor = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch {} };
persist();
window.addEventListener('storage', (e) => { if (e.key === STORE) { Object.assign(store, load()); renderMineCount(); } });
const kindOf = (d) => (d.kind === 'bottle' ? 'bottle' : 'duck');
const isSaved = (id, kind = 'duck') => store.saved.some((d) => d.id === id && kindOf(d) === kind);

document.documentElement.style.setProperty('--paper-img', `url(${paperDataURL()})`);

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The pond is a little choppy. Try again.');
  return data;
}

// ---------- shared pond ----------
const pool = new Map();
let maxId = 0;
let openDuck = null;
const pond = new Pond($('pond'), {
  seed: 7,
  onDuckTap: (duck) => openCard(duck, 'main'),
  onInteract: () => dismissHint(),
  onBottleTap: () => toast('Pick up the fishing rod on the beach to reel in that bottle.'),
  onBottleCatch: (b) => { endReel(); catching = true; sound.splash(0.7); openCard(b, 'catch'); },
  onHook: () => startReel(),
  onEscape: () => { endReel(); toast('It slipped off the hook! Drag the line back to it and reel faster.'); },
  onReel: (p) => { sound.tick(); $('reel-fill').style.width = `${Math.round(p * 100)}%`; },
  onThrow: (p, aim) => throwBottle(p, aim),
  onBeachTap: (b) => openCard(b, 'beach'),
  onRodChange: (held) => {
    $('rod-btn').textContent = held ? 'Put the rod down' : 'Pick up the rod';
    $('rod-btn').setAttribute('aria-pressed', held);
    document.body.classList.toggle('fishing', held);
    if (held) toast(touch ? 'Drag the line across the pond to hook a bottle.' : 'Move the line across the pond (mouse or arrow keys) to hook a bottle.');
    dismissHint();
  },
});
let catching = false;

// ---------- reeling ----------
let reelTimer = 0, reelHold = 0;
function startReel() {
  sound.splash(0.5);
  document.body.classList.add('reeling');
  $('reel-text').textContent = touch ? 'A bottle bit! Tap or hold Reel' : 'A bottle bit! Tap Reel or press space';
  $('reel-fill').style.width = '0%';
  $('reel-bar').hidden = false;
  clearInterval(reelTimer);
  reelTimer = setInterval(() => {
    const p = pond.reelProgress;
    if (p == null) return;
    $('reel-fill').style.width = `${Math.round(p * 100)}%`;
  }, 100);
}
function endReel() {
  clearInterval(reelTimer); clearInterval(reelHold);
  document.body.classList.remove('reeling');
  $('reel-bar').hidden = true;
}
const stopHold = () => clearInterval(reelHold);
$('reel-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { $('reel-btn').setPointerCapture(e.pointerId); } catch {}
  pond.reel(0.1);
  clearInterval(reelHold);
  reelHold = setInterval(() => pond.reel(0.045), 140);
});
['pointerup', 'touchend', 'touchcancel'].forEach((t) => $('reel-btn').addEventListener(t, stopHold));
window.addEventListener('pointerup', stopHold);
$('reel-btn').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') stopHold(); });
$('reel-btn').addEventListener('contextmenu', (e) => e.preventDefault());
$('reel-btn').addEventListener('click', (e) => { if (e.detail === 0) pond.reel(0.1); });

// ---------- bottles ----------
const bpool = new Map();
let maxBottleId = 0;
const bottleCap = () => Math.max(5, Math.min(14, Math.floor((pond.w * pond.h) / 50000)));
const floating = () => pond.bottles.filter((o) => o.state !== 'sink');
function ingestBottles(list) {
  const added = [];
  for (const b of list) {
    if (store.reportedBottles.includes(b.id)) continue;
    b.kind = 'bottle';
    if (!bpool.has(b.id)) added.push(b);
    bpool.set(b.id, b);
    maxBottleId = Math.max(maxBottleId, b.id);
  }
  return added;
}
function pickBottle() {
  const shown = new Set(pond.bottles.map((o) => o.b.id));
  const c = [...bpool.values()].filter((b) => !shown.has(b.id) && !isSaved(b.id, 'bottle'));
  if (!c.length) return null;
  const fresh = c.filter(isNewDuck).sort((a, b) => b.createdAt - a.createdAt);
  if (fresh.length) return fresh[0];
  c.sort((a, b) => (recentlyShown.get(`b${a.id}`) || 0) - (recentlyShown.get(`b${b.id}`) || 0) || Math.random() - 0.5);
  return c[0];
}
function sinkOldBottle() {
  const old = shuffled(pond.bottles.filter((o) => o.state === 'float' && !isNewDuck(o.b) && o.b !== openDuck));
  if (old.length) pond.removeBottle(old[0].b.id);
  return old.length > 0;
}
function fillBottles() {
  let guard = 0;
  while (floating().length < bottleCap() && guard++ < 40) {
    const b = pickBottle();
    if (!b) break;
    recentlyShown.set(`b${b.id}`, Date.now());
    pond.addBottle(b);
  }
}
setInterval(() => {
  if (document.hidden || bpool.size <= floating().length) return;
  if (floating().length >= bottleCap() && !sinkOldBottle()) return;
  setTimeout(fillBottles, 1500);
}, 22000);
let pendingLetter = '';
function throwBottle(p, aim) {
  document.body.classList.remove('aiming');
  $('aim-bar').hidden = true;
  const x = Math.min(0.92, Math.max(0.08, p.x / pond.w)), y = Math.min(0.88, Math.max(0.12, p.y / pond.h));
  const message = pendingLetter;
  const temp = { kind: 'bottle', id: -Date.now(), paper: aim.paper, message, createdAt: Date.now(), x, y, starter: false };
  const o = pond.addBottle(temp, { from: pond.aimOrigin() });
  setTimeout(() => sound.splash(1), 1100);
  api('/api/bottles', { method: 'POST', body: JSON.stringify({ message, paper: aim.paper, x, y }) })
    .then(({ bottle }) => {
      bottle.kind = 'bottle';
      o.b = bottle;
      ingestBottles([bottle]);
      store.tossed.push(bottle.id);
      persist();
      $('letter').value = '';
      pendingLetter = '';
      toast('Splash! Your bottle is bobbing in the pond for a stranger to fish out.');
    })
    .catch((err) => { pond.removeBottle(temp.id); toast(err.message); openLetter(); });
}
const guest = { id: 0, guest: true, color: 'cream', accessory: 'none', message: '' };

function capacity() {
  return Math.max(8, Math.min(36, Math.floor((pond.w * pond.h) / 24000)));
}
const visibleDucks = () => pond.entities.filter((e) => e.state !== 'leave' && !e.player);
const isNewDuck = (d) => !d.starter && Date.now() - d.createdAt < NEW_MS;
const shuffled = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const recentlyShown = new Map();

function pickNext() {
  const shown = new Set(pond.entities.map((e) => e.duck.id));
  const candidates = [...pool.values()].filter((d) => !shown.has(d.id) && !store.reported.includes(d.id));
  if (!candidates.length) return null;
  const fresh = candidates.filter(isNewDuck).sort((a, b) => b.createdAt - a.createdAt);
  if (fresh.length) return fresh[0];
  candidates.sort((a, b) => (recentlyShown.get(a.id) || 0) - (recentlyShown.get(b.id) || 0) || Math.random() - 0.5);
  return candidates[0];
}
function makeRoom() {
  const cap = capacity();
  const vis = visibleDucks();
  if (vis.length < cap) return;
  const removable = shuffled(vis.filter((e) => !isNewDuck(e.duck) && e.duck !== openDuck && pond.highlight?.id !== e.duck.id));
  if (removable.length) pond.remove(removable[0].duck.id);
}
function bringIn(duck, from = 'edge') {
  if (pond.has(duck.id)) return pond.get(duck.id);
  makeRoom();
  recentlyShown.set(duck.id, Date.now());
  return pond.add(duck, { from });
}
function fillPond(initial = false) {
  const cap = capacity();
  let guard = 0;
  while (visibleDucks().length < cap && guard++ < 60) {
    const next = pickNext();
    if (!next) break;
    recentlyShown.set(next.id, Date.now());
    pond.add(next, { from: initial ? 'random' : 'edge' });
  }
}
// slowly rotate which ducks are visiting, so every duck gets found eventually
setInterval(() => {
  if (document.hidden || pool.size <= visibleDucks().length) return;
  const next = pickNext();
  if (!next) return;
  const vis = visibleDucks();
  if (vis.length >= capacity()) {
    const removable = shuffled(vis.filter((e) => !isNewDuck(e.duck) && e.duck !== openDuck && pond.highlight?.id !== e.duck.id));
    if (!removable.length) return;
    pond.remove(removable[0].duck.id);
  }
  recentlyShown.set(next.id, Date.now());
  pond.add(next, { from: 'edge' });
}, 16000);

function ingest(ducks) {
  let added = [];
  for (const d of ducks) {
    if (store.reported.includes(d.id)) continue;
    if (!pool.has(d.id)) added.push(d);
    pool.set(d.id, d);
    maxId = Math.max(maxId, d.id);
  }
  return added;
}
async function refresh() {
  try {
    const data = await api(`/api/ducks?since=${maxId}`);
    const added = ingest(data.ducks);
    for (const id of data.hidden || []) { pool.delete(id); if (pond.has(id)) pond.remove(id); }
    for (const d of added.sort((a, b) => a.id - b.id)) {
      if (!store.released.includes(d.id) && isNewDuck(d)) bringIn(d, 'edge');
    }
    fillPond();
    renderNewCount();
    const bd = await api(`/api/bottles?since=${maxBottleId}`);
    const newB = ingestBottles(bd.bottles);
    for (const id of bd.hidden || []) { bpool.delete(id); pond.removeBottle(id); }
    for (const b of newB) {
      if (store.tossed.includes(b.id) || pond.hasBottle(b.id) || isSaved(b.id, 'bottle')) continue;
      if (floating().length >= bottleCap()) sinkOldBottle();
      recentlyShown.set(`b${b.id}`, Date.now());
      const o = pond.addBottle(b);
      pond.splash(o.x, o.y, 1.4);
    }
    fillBottles();
  } catch {}
}

async function init() {
  try {
    const data = await api('/api/ducks');
    ingest(data.ducks);
    ingestBottles((await api('/api/bottles')).bottles);
  } catch {
    toast('Could not reach the pond. Retrying…');
  }
  const mine = store.released.map((id) => pool.get(id)).filter(Boolean);
  const me = mine.length ? mine[mine.length - 1] : guest;
  const e = pond.add(me, { from: 'random', player: true });
  e.x = pond.w / 2; e.y = pond.h * 0.6; e.h = -Math.PI / 2;
  fillPond(true);
  fillBottles();
  renderNewCount();
  renderMineCount();
  pond.start();
  setInterval(() => { if (!document.hidden) refresh(); }, 6000);
  showHint();
}

// ---------- no zooming ----------
['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) e.preventDefault(); });

// ---------- sound ----------
const renderSound = () => {
  $('sound-btn').textContent = sound.on ? 'Sound on' : 'Sound off';
  $('sound-btn').setAttribute('aria-pressed', sound.on);
};
$('sound-btn').addEventListener('click', (e) => { e.stopPropagation(); sound.toggle(); renderSound(); });
['pointerdown', 'keydown'].forEach((t) => window.addEventListener(t, (e) => { if (e.target !== $('sound-btn')) sound.wake(); }, { passive: true }));
renderSound();

// ---------- hint & toast ----------
const touch = matchMedia('(pointer: coarse)').matches;
function showHint() {
  if (store.hintSeen) return;
  $('hint').textContent = touch ? 'Tap the water to swim. Grab the rod on the beach to fish for messages in bottles.' : 'Arrow keys or click to swim. Grab the rod on the beach to fish for messages in bottles.';
  $('hint').hidden = false;
}
function dismissHint() {
  if (store.hintSeen) return;
  store.hintSeen = true; persist();
  setTimeout(() => $('hint').classList.add('gone'), 2500);
}
let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
}

// ---------- new ducks finder ----------
let newCursor = 0;
function newDucks() {
  return [...pool.values()].filter((d) => isNewDuck(d) && !store.released.includes(d.id)).sort((a, b) => b.createdAt - a.createdAt);
}
function renderNewCount() {
  const n = newDucks().length;
  $('find-new').hidden = n === 0;
  $('new-count').textContent = n;
  $('find-new').setAttribute('aria-label', `Find new ducks, ${n} released today`);
}
$('find-new').addEventListener('click', () => {
  const list = newDucks();
  if (!list.length) return;
  const d = list[newCursor++ % list.length];
  const e = bringIn(d, 'edge');
  pond.flash(d.id);
  if (pond.player && e) {
    const tx = Math.min(Math.max(e.state === 'enter' ? e.tx : e.x, 40), pond.w - 40);
    const ty = Math.min(Math.max((e.state === 'enter' ? e.ty : e.y) + 70, 60), pond.h - 60);
    pond.target = { x: tx, y: ty };
  }
  toast(list.length > 1 ? `New duck ${((newCursor - 1) % list.length) + 1} of ${list.length} is circled.` : 'The newest duck is circled.');
  dismissHint();
});

// ---------- message card ----------
let cardContext = 'main';
let cardAnim = 0;
let cardOpenedAt = 0;
function describe(d) {
  return `${COLORS[d.color]?.name || 'A'} duck${d.accessory !== 'none' ? ` · ${ACCESSORIES[d.accessory].toLowerCase()}` : ''}`;
}
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  const days = Math.round(s / 86400);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
function openCard(duck, context) {
  openDuck = duck;
  cardContext = context;
  const bottle = kindOf(duck) === 'bottle';
  const own = bottle ? store.tossed.includes(duck.id) : store.released.includes(duck.id);
  $('card').classList.toggle('letter', bottle);
  sealed = bottle && context === 'catch';
  popAt = 0;
  $('card').classList.toggle('sealed', sealed);
  $('card').classList.remove('opened');
  $('report-confirm').hidden = true;
  $('card-make').hidden = !duck.guest;
  $('card-save').hidden = !bottle || context === 'beach';
  $('card-remove').hidden = !bottle || context !== 'beach';
  $('card-fish').hidden = bottle;
  $('card-report').hidden = !bottle || own;
  if (duck.guest) {
    $('card-kicker').textContent = 'This is you';
    $('card-message').textContent = 'Make your own duck to join the pond, then write a letter and throw it in a bottle for a stranger to fish out.';
    $('card-meta').textContent = '';
  } else if (bottle) {
    $('card-kicker').textContent = own ? 'Your message in a bottle' : 'You fished out a message in a bottle';
    $('card-message').textContent = duck.message;
    $('card-meta').textContent = duck.starter ? 'Bobbing here since the pond began' : `Tossed in ${ago(duck.createdAt)}`;
  } else {
    $('card-kicker').textContent = duck.name || describe(duck);
    $('card-message').textContent = own ? 'This is you, paddling around the pond.' : 'A fellow visitor, paddling around the pond. Their messages are out there in the bottles.';
    $('card-meta').textContent = `${duck.name ? `${describe(duck)} · ` : ''}${duck.starter ? 'One of the first ducks in the pond' : `Joined ${ago(duck.createdAt)}`}`;
  }
  if (sealed) $('card-kicker').textContent = 'You reeled in a bottle! Pop the cork to read it';
  renderSaveButton();
  cardOpenedAt = performance.now();
  $('card-wrap').hidden = false;
  const c = $('card-duck');
  cancelAnimationFrame(cardAnim);
  const t0 = performance.now();
  const tick = (t) => {
    if (bottle) drawBottlePortrait(c, duck, { t: (t - t0) / 1000, pop: sealed ? -1 : popAt ? Math.min(1, (t - popAt) / 900) : 1 });
    else drawDuckPortrait(c, duck, { heading: -Math.PI / 2 + Math.sin((t - t0) / 1400) * 0.25, phase: (t - t0) / 600 });
    if (!$('card-wrap').hidden) cardAnim = requestAnimationFrame(tick);
  };
  cardAnim = requestAnimationFrame(tick);
  (sealed ? $('card-pop') : duck.guest ? $('card-make') : !bottle ? $('card-fish') : context !== 'beach' ? $('card-save') : $('card-remove')).focus({ preventScroll: true });
}
let sealed = false, popAt = 0;
function popCork() {
  if (!sealed) return;
  sealed = false;
  popAt = performance.now();
  sound.pop();
  const own = store.tossed.includes(openDuck.id);
  $('card-kicker').textContent = own ? 'Your message in a bottle' : 'You fished out a message in a bottle';
  $('card').classList.remove('sealed');
  $('card').classList.add('opened');
  $('card-save').focus({ preventScroll: true });
}
$('card-pop').addEventListener('click', popCork);
$('card-duck').addEventListener('click', popCork);
function renderSaveButton() {
  const b = $('card-save');
  if (!openDuck || kindOf(openDuck) !== 'bottle') return;
  const saved = isSaved(openDuck.id, 'bottle');
  b.textContent = saved ? 'Kept on your beach' : 'Keep this letter';
  b.disabled = saved;
  b.classList.toggle('saved', saved);
}
function closeCard() {
  $('card-wrap').hidden = true;
  openDuck = null;
  if (catching) { catching = false; pond.releaseCatch(); }
  cancelAnimationFrame(cardAnim);
}
$('card-save').addEventListener('click', () => {
  const d = openDuck;
  if (!d || d.guest) return;
  if (kindOf(d) !== 'bottle' || d.id < 0) return;
  if (isSaved(d.id, 'bottle')) { toast('That letter is already on your beach.'); return; }
  store.saved.push({ kind: 'bottle', id: d.id, paper: d.paper, message: d.message, createdAt: d.createdAt, starter: !!d.starter, savedAt: Date.now() });
  persist();
  if (catching) { catching = false; pond.keepCatch(d); }
  else pond.setBeach(store.saved);
  closeCard();
  toast('Kept! It is on your beach now. Tap it there to reread it anytime.');
});
$('card-remove').addEventListener('click', () => {
  const d = openDuck;
  if (!d) return;
  store.saved = store.saved.filter((s) => !(s.id === d.id && kindOf(s) === 'bottle'));
  persist();
  closeCard();
  pond.tossBack(d);
  toast('Tossed back in for someone else to fish out.');
});
$('card-make').addEventListener('click', () => { closeCard(); openMaker(); });
$('card-fish').addEventListener('click', () => { closeCard(); pond.setRod(true); });
$('card-report').addEventListener('click', () => { $('report-confirm').hidden = false; $('report-yes').focus(); });
$('report-no').addEventListener('click', () => { $('report-confirm').hidden = true; });
$('report-yes').addEventListener('click', async () => {
  const d = openDuck;
  if (!d) return;
  if (kindOf(d) === 'bottle') {
    try { await api(`/api/bottles/${d.id}/report`, { method: 'POST', body: JSON.stringify({ visitor: store.visitor }) }); } catch {}
    store.reportedBottles.push(d.id);
    store.saved = store.saved.filter((s) => !(s.id === d.id && kindOf(s) === 'bottle'));
    persist();
    bpool.delete(d.id);
    if (catching) { catching = false; pond.releaseCatch({ keep: false }); }
    pond.removeBottle(d.id);
    pond.removeKept(d.id);
    closeCard();
    toast('Thanks. That letter is reported and hidden for you.');
    return;
  }
  try {
    await api(`/api/ducks/${d.id}/report`, { method: 'POST', body: JSON.stringify({ visitor: store.visitor }) });
  } catch {}
  store.reported.push(d.id);
  store.saved = store.saved.filter((s) => !(s.id === d.id && kindOf(s) === 'duck'));
  persist();
  pool.delete(d.id);
  pond.remove(d.id);
  closeCard();
  renderMineCount();
  renderNewCount();
  toast('Thanks. That message is reported and hidden for you.');
});
$('card-wrap').addEventListener('click', (e) => {
  if (e.target === $('card-wrap') && performance.now() - cardOpenedAt < 450) return;
  if (e.target === $('card-wrap') || e.target.closest('[data-close]')) closeCard();
});

// ---------- duck maker ----------
const draft = { color: 'cream', accessory: 'none', paper: 'cream' };
let previewAnim = 0;
function radioGroup(container, entries, key, renderItem) {
  container.setAttribute('role', 'radiogroup');
  container.innerHTML = '';
  entries.forEach(([value, label]) => {
    const b = renderItem(value, label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.value = value;
    b.addEventListener('click', () => { draft[key] = value; sync(); });
    b.addEventListener('keydown', (ev) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const i = entries.findIndex(([v]) => v === draft[key]);
      const n = (i + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
      draft[key] = entries[n][0];
      sync();
      container.querySelector(`[data-value="${entries[n][0]}"]`).focus();
    });
    container.appendChild(b);
  });
  const sync = () => {
    container.querySelectorAll('[role=radio]').forEach((b) => {
      const on = b.dataset.value === draft[key];
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    });
    $('swatch-name') && ($('swatch-name').textContent = COLORS[draft.color].name);
  };
  sync();
}
radioGroup($('colors'), Object.entries(COLORS).map(([k, v]) => [k, v.name]), 'color', (value, label) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.backgroundColor = COLORS[value].body;
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
});
const sn = document.createElement('p');
sn.id = 'swatch-name'; sn.className = 'swatch-name'; sn.textContent = COLORS[draft.color].name;
$('colors').after(sn);
radioGroup($('accessories'), Object.entries(ACCESSORIES).map(([k, v]) => [k, ({ none: 'None', daisy: 'Daisies', bow: 'Bow', sunhat: 'Sun hat', scarf: 'Scarf', lilyleaf: 'Leaf cap', beanie: 'Beanie' })[k]]), 'accessory', (value, label) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = label;
  b.setAttribute('aria-label', ACCESSORIES[value]);
  return b;
});

function openMaker() {
  closeCard();
  $('maker-wrap').hidden = false;
  $('maker-error').textContent = '';
  const c = $('preview');
  const t0 = performance.now();
  cancelAnimationFrame(previewAnim);
  const tick = (t) => {
    drawDuckPortrait(c, { ...draft, id: 2 }, { heading: -Math.PI / 2 + Math.sin((t - t0) / 1600) * 0.35, phase: (t - t0) / 500 });
    if (!$('maker-wrap').hidden) previewAnim = requestAnimationFrame(tick);
  };
  previewAnim = requestAnimationFrame(tick);
  setTimeout(() => $('colors').querySelector('[aria-checked=true]').focus({ preventScroll: true }), 50);
}
function closeMaker() { $('maker-wrap').hidden = true; cancelAnimationFrame(previewAnim); }
$('open-maker').addEventListener('click', openMaker);
$('maker-wrap').addEventListener('click', (e) => { if (e.target === $('maker-wrap') || e.target.closest('[data-close]')) closeMaker(); });
$('maker').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('release');
  btn.disabled = true;
  btn.textContent = 'Releasing…';
  try {
    const { duck } = await api('/api/ducks', { method: 'POST', body: JSON.stringify({ color: draft.color, accessory: draft.accessory, name: $('duck-name').value.trim() }) });
    ingest([duck]);
    store.released.push(duck.id);
    persist();
    closeMaker();
    $('duck-name').value = '';
    // your new duck swims in from the bottom and becomes the duck you steer
    const old = pond.player;
    if (old) { if (old.duck.guest) pond.remove(0); else pond.setPlayer(null); old.player = false; }
    makeRoom();
    const e = pond.add(duck, { from: 'bottom', player: true });
    pond.target = null;
    pond.flash(duck.id);
    toast('Your duck is swimming into the pond.');
    renderNewCount();
    dismissHint();
    void e;
  } catch (err) {
    $('maker-error').textContent = err.message;
  } finally {
    btn.textContent = 'Add my duck to the pond';
    btn.disabled = false;
  }
});

// ---------- letters ----------
radioGroup($('papers'), Object.entries(PAPERS).map(([k, v]) => [k, v.name]), 'paper', (value, label) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.backgroundColor = PAPERS[value].paper;
  b.setAttribute('aria-label', `${label} paper`);
  b.title = label;
  return b;
});
function openLetter() {
  closeCard();
  closeMaker();
  pond.setRod(false);
  $('letter-wrap').hidden = false;
  $('letter-error').textContent = '';
  updateLetterCount();
  setTimeout(() => $('letter').focus({ preventScroll: true }), 50);
}
function closeLetter() { $('letter-wrap').hidden = true; }
function updateLetterCount() {
  const n = [...$('letter').value].length;
  $('letter-count').textContent = `${n}/${MAX_LETTER}`;
  $('seal').disabled = n === 0 || n > MAX_LETTER;
}
function cancelAim() { pond.stopAim(); document.body.classList.remove('aiming'); $('aim-bar').hidden = true; }
$('letter').addEventListener('input', updateLetterCount);
$('open-letter').addEventListener('click', openLetter);
$('letter-wrap').addEventListener('click', (e) => { if (e.target === $('letter-wrap') || e.target.closest('[data-close]')) closeLetter(); });
$('letter-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const m = $('letter').value.trim();
  if (!m) { $('letter-error').textContent = 'Write your letter first.'; return; }
  if ([...m].length > MAX_LETTER) { $('letter-error').textContent = `Letters can be up to ${MAX_LETTER} characters.`; return; }
  pendingLetter = m;
  closeLetter();
  pond.startAim(draft.paper);
  document.body.classList.add('aiming');
  $('aim-bar').hidden = false;
  dismissHint();
});
$('aim-cancel').addEventListener('click', () => { cancelAim(); openLetter(); });
$('rod-btn').addEventListener('click', () => { cancelAim(); pond.setRod(!pond.rod.held); });

// ---------- beach of kept bottles ----------
function renderMineCount() { pond.setBeach(store.saved); }

// ---------- keyboard ----------
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('card-wrap').hidden) closeCard();
    else if (!$('maker-wrap').hidden) closeMaker();
    else if (!$('letter-wrap').hidden) closeLetter();
    else if (pond.aim) cancelAim();
    else if (pond.rod?.held) pond.setRod(false);
    return;
  }
  if (e.key === ' ' && pond.reelProgress != null && !e.target.closest?.('textarea, input')) {
    e.preventDefault();
    if (!e.repeat || Math.random() < 0.5) pond.reel(e.repeat ? 0.045 : 0.1);
    return;
  }
  const busy = !$('card-wrap').hidden || !$('maker-wrap').hidden || !$('letter-wrap').hidden;
  if (busy || e.target.closest?.('textarea, input')) return;
  if (ARROWS.includes(e.key)) {
    e.preventDefault();
    pond.keys.add(e.key);
    pond.showKeyHint = true;
    dismissHint();
  } else if ((e.key === 'Enter' || e.key === ' ') && !pond.rod?.held && pond.nearby && pond.showKeyHint && document.activeElement === document.body) {
    e.preventDefault();
    openCard(pond.nearby.duck, 'main');
  }
});
window.addEventListener('keyup', (e) => pond.keys.delete(e.key));
window.addEventListener('blur', () => pond.keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pond.stop();
  else { pond.start(); refresh(); }
});

init();
