import { Pond, drawDuckPortrait } from './pond.js';
import { COLORS, ACCESSORIES } from './duckart.js';
import { paperDataURL } from './painter.js';

const $ = (id) => document.getElementById(id);
const MAX = 140;
const NEW_MS = 24 * 3600 * 1000;
const STORE = 'duckpond.v1';

// ---------- local storage (My Pond lives in this browser) ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
const store = Object.assign({ visitor: '', saved: [], released: [], reported: [], hintSeen: false }, load());
if (!store.visitor) store.visitor = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch {} };
persist();
window.addEventListener('storage', (e) => { if (e.key === STORE) { Object.assign(store, load()); renderMineCount(); } });
const isSaved = (id) => store.saved.some((d) => d.id === id);

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
});
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
  } catch {}
}

async function init() {
  try {
    const data = await api('/api/ducks');
    ingest(data.ducks);
  } catch {
    toast('Could not reach the pond. Retrying…');
  }
  const mine = store.released.map((id) => pool.get(id)).filter(Boolean);
  const me = mine.length ? mine[mine.length - 1] : guest;
  const e = pond.add(me, { from: 'random', player: true });
  e.x = pond.w / 2; e.y = pond.h * 0.6; e.h = -Math.PI / 2;
  fillPond(true);
  renderNewCount();
  renderMineCount();
  pond.start();
  setInterval(() => { if (!document.hidden) refresh(); }, 6000);
  showHint();
}

// ---------- hint & toast ----------
const touch = matchMedia('(pointer: coarse)').matches;
function showHint() {
  if (store.hintSeen) return;
  $('hint').textContent = touch ? 'Tap the water to swim. Tap a duck to read its message.' : 'Arrow keys or click to swim. Click a duck to read its message.';
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
  toast(list.length > 1 ? `New duck ${((newCursor - 1) % list.length) + 1} of ${list.length} is circled. Tap it to read.` : 'The newest duck is circled. Tap it to read.');
  dismissHint();
});

// ---------- message card ----------
let cardContext = 'main';
let cardAnim = 0;
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
  const own = store.released.includes(duck.id);
  $('report-confirm').hidden = true;
  $('card-make').hidden = !duck.guest;
  $('card-save').hidden = duck.guest || context === 'mine';
  $('card-remove').hidden = context !== 'mine';
  $('card-report').hidden = duck.guest || own;
  if (duck.guest) {
    $('card-kicker').textContent = 'This is you';
    $('card-message').textContent = 'Make a duck, tuck a message inside, and release it for a stranger to find.';
    $('card-meta').textContent = '';
  } else {
    $('card-kicker').textContent = own ? 'Your duck' : describe(duck);
    $('card-message').textContent = duck.message;
    $('card-meta').textContent = duck.starter ? 'One of the first ducks in the pond' : `Released ${ago(duck.createdAt)}`;
  }
  renderSaveButton();
  $('card-wrap').hidden = false;
  const c = $('card-duck');
  cancelAnimationFrame(cardAnim);
  const t0 = performance.now();
  const tick = (t) => {
    drawDuckPortrait(c, duck, { heading: -Math.PI / 2 + Math.sin((t - t0) / 1400) * 0.25, phase: (t - t0) / 600 });
    if (!$('card-wrap').hidden) cardAnim = requestAnimationFrame(tick);
  };
  cardAnim = requestAnimationFrame(tick);
  (context === 'main' ? $('card-save') : $('card-remove')).focus({ preventScroll: true });
}
function renderSaveButton() {
  const b = $('card-save');
  if (!openDuck || openDuck.guest) return;
  const saved = isSaved(openDuck.id);
  b.textContent = saved ? 'Saved in My Pond' : 'Save to My Pond';
  b.disabled = saved;
  b.classList.toggle('saved', saved);
}
function closeCard() {
  $('card-wrap').hidden = true;
  openDuck = null;
  cancelAnimationFrame(cardAnim);
}
$('card-save').addEventListener('click', () => {
  const d = openDuck;
  if (!d || d.guest) return;
  if (isSaved(d.id)) { toast('That duck is already in your pond.'); return; }
  store.saved.push({ id: d.id, color: d.color, accessory: d.accessory, message: d.message, createdAt: d.createdAt, starter: !!d.starter, savedAt: Date.now() });
  persist();
  renderSaveButton();
  renderMineCount();
  toast('Saved to My Pond. It is still out here for others to find.');
});
$('card-remove').addEventListener('click', () => {
  const d = openDuck;
  if (!d) return;
  store.saved = store.saved.filter((s) => s.id !== d.id);
  persist();
  mini?.remove(d.id);
  closeCard();
  renderMineCount();
  renderMine();
  toast('Removed from My Pond.');
});
$('card-make').addEventListener('click', () => { closeCard(); openMaker(); });
$('card-report').addEventListener('click', () => { $('report-confirm').hidden = false; $('report-yes').focus(); });
$('report-no').addEventListener('click', () => { $('report-confirm').hidden = true; });
$('report-yes').addEventListener('click', async () => {
  const d = openDuck;
  if (!d) return;
  try {
    await api(`/api/ducks/${d.id}/report`, { method: 'POST', body: JSON.stringify({ visitor: store.visitor }) });
  } catch {}
  store.reported.push(d.id);
  store.saved = store.saved.filter((s) => s.id !== d.id);
  persist();
  pool.delete(d.id);
  pond.remove(d.id);
  mini?.remove(d.id, { leave: false });
  closeCard();
  renderMineCount();
  renderNewCount();
  toast('Thanks. That message is reported and hidden for you.');
});
$('card-wrap').addEventListener('click', (e) => { if (e.target === $('card-wrap') || e.target.closest('[data-close]')) closeCard(); });

// ---------- duck maker ----------
const draft = { color: 'cream', accessory: 'none' };
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
  updateCount();
  const c = $('preview');
  const t0 = performance.now();
  cancelAnimationFrame(previewAnim);
  const tick = (t) => {
    drawDuckPortrait(c, { ...draft, id: 2 }, { heading: -Math.PI / 2 + Math.sin((t - t0) / 1600) * 0.35, phase: (t - t0) / 500 });
    if (!$('maker-wrap').hidden) previewAnim = requestAnimationFrame(tick);
  };
  previewAnim = requestAnimationFrame(tick);
  setTimeout(() => (touch ? $('colors').querySelector('[aria-checked=true]') : $('message')).focus({ preventScroll: true }), 50);
}
function closeMaker() { $('maker-wrap').hidden = true; cancelAnimationFrame(previewAnim); }
function updateCount() {
  const n = [...$('message').value].length;
  $('char-count').textContent = `${n}/${MAX}`;
  $('release').disabled = n === 0 || n > MAX;
}
$('message').addEventListener('input', updateCount);
$('open-maker').addEventListener('click', openMaker);
$('maker-wrap').addEventListener('click', (e) => { if (e.target === $('maker-wrap') || e.target.closest('[data-close]')) closeMaker(); });
$('maker').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const message = $('message').value.trim();
  if (!message) { $('maker-error').textContent = 'Tuck a little message inside your duck first.'; return; }
  if ([...message].length > MAX) { $('maker-error').textContent = `Messages can be up to ${MAX} characters.`; return; }
  const btn = $('release');
  btn.disabled = true;
  btn.textContent = 'Releasing…';
  try {
    const { duck } = await api('/api/ducks', { method: 'POST', body: JSON.stringify({ ...draft, message }) });
    ingest([duck]);
    store.released.push(duck.id);
    persist();
    closeMaker();
    $('message').value = '';
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
    btn.textContent = 'Release my duck';
    updateCount();
  }
});

// ---------- My Pond ----------
let mini = null;
function renderMineCount() {
  $('mine-count').textContent = store.saved.length;
  $('open-mine').setAttribute('aria-label', `My Pond, ${store.saved.length} saved duck${store.saved.length === 1 ? '' : 's'}`);
}
function renderMine() {
  const n = store.saved.length;
  $('mine-empty').hidden = n > 0;
  $('mine-sub').textContent = n ? `${n} saved duck${n === 1 ? '' : 's'}, kept in this browser. Tap one to reread it.` : 'Ducks you save are kept in this browser.';
  if (!mini) return;
  const ids = new Set(store.saved.map((d) => d.id));
  for (const e of [...mini.entities]) if (!ids.has(e.duck.id)) mini.remove(e.duck.id, { leave: false });
  for (const d of store.saved) if (!mini.has(d.id)) mini.add(d, { from: 'random' });
}
function openMine() {
  closeCard();
  closeMaker();
  $('mine-wrap').hidden = false;
  pond.stop();
  if (!mini) mini = new Pond($('mini-pond'), { mini: true, seed: 19, onDuckTap: (d) => openCard(d, 'mine') });
  else mini.resize();
  renderMine();
  mini.start();
  $('close-mine').focus({ preventScroll: true });
}
function closeMine() {
  $('mine-wrap').hidden = true;
  mini?.stop();
  closeCard();
  pond.start();
}
$('open-mine').addEventListener('click', openMine);
$('close-mine').addEventListener('click', closeMine);

// ---------- keyboard ----------
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('card-wrap').hidden) closeCard();
    else if (!$('maker-wrap').hidden) closeMaker();
    else if (!$('mine-wrap').hidden) closeMine();
    return;
  }
  const busy = !$('card-wrap').hidden || !$('maker-wrap').hidden || !$('mine-wrap').hidden;
  if (busy || e.target.closest?.('textarea, input')) return;
  if (ARROWS.includes(e.key)) {
    e.preventDefault();
    pond.keys.add(e.key);
    pond.showKeyHint = true;
    dismissHint();
  } else if ((e.key === 'Enter' || e.key === ' ') && pond.nearby && pond.showKeyHint && document.activeElement === document.body) {
    e.preventDefault();
    openCard(pond.nearby.duck, 'main');
  }
});
window.addEventListener('keyup', (e) => pond.keys.delete(e.key));
window.addEventListener('blur', () => pond.keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pond.stop(); mini?.stop(); }
  else if (!$('mine-wrap').hidden) mini?.start();
  else { pond.start(); refresh(); }
});

init();
