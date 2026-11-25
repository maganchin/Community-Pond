const express = require('express');
const path = require('path');
const db = require('./db');

const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGE = 140;
const REPORT_HIDE_THRESHOLD = 3;
const COLORS = ['cream', 'butter', 'blush', 'sage', 'lavender', 'terracotta', 'mist', 'charcoal'];
const ACCESSORIES = ['none', 'daisy', 'bow', 'sunhat', 'scarf', 'lilyleaf', 'beanie'];
const MAX_LETTER = 280;
const PAPERS = ['cream', 'rose', 'mint', 'sky'];

const STARTERS = [
  ['cream', 'none', 'The water is warm today. Say hello to the lily pads for me.'],
  ['butter', 'daisy', 'You are doing better than you think. Keep paddling.'],
  ['blush', 'bow', 'Found a perfect skipping stone this morning. Hope your day has one too.'],
  ['sage', 'lilyleaf', 'Drink some water, stretch your wings, look at the sky for a minute.'],
  ['lavender', 'beanie', 'Someone out there is glad you exist. (It is me, a duck.)'],
  ['terracotta', 'sunhat', 'Slow is still moving. Ripples count.'],
  ['mist', 'scarf', 'If you are reading this, the pond says hi.'],
  ['cream', 'sunhat', 'Tiny reminder: you are allowed to rest.'],
];


const STARTER_BOTTLES = [
  ['cream', 0.22, 0.3, 'About money: future you is counting on present you. Start small, start now, and let time do the heavy lifting. A little set aside every month grows quietly into freedom. Nobody regrets starting early. They only regret waiting.'],
  ['rose', 0.76, 0.26, 'About love: the right one doesn\'t make you guess. You feel calmer around them, not smaller. You can be messy, boring and honest, and they stay curious about you. If it feels like home and like growing at the same time, hold on.'],
  ['mint', 0.3, 0.78, 'Today I noticed the light on the water and felt calm for the first time in a while. Passing that calm to you.'],
  ['sky', 0.7, 0.7, 'About work: change is scary, but staying the same is scarier. A year from now you\'ll wish you\'d started today. You don\'t need the whole plan, just the next brave step. Take it.'],
];
async function setup() {
  await db.init();
  const base = Date.now() - 7 * 24 * 3600 * 1000;
  if (Number((await db.get('SELECT COUNT(*) AS n FROM ducks WHERE starter = 1')).n) === 0) {
    for (const [i, [c, a, m]] of STARTERS.entries()) await db.insert('INSERT INTO ducks (color, accessory, message, starter, created_at) VALUES (?, ?, ?, 1, ?)', [c, a, m, base + i * 60000]);
  }
  if (Number((await db.get('SELECT COUNT(*) AS n FROM bottles WHERE starter = 1')).n) === 0) {
    for (const [i, [p, x, y, m]] of STARTER_BOTTLES.entries()) await db.insert('INSERT INTO bottles (paper, x, y, message, starter, created_at) VALUES (?, ?, ?, ?, 1, ?)', [p, x, y, m, base + i * 60000]);
  }
}
let ready = null;
const whenReady = () => (ready ||= setup().catch((e) => { ready = null; throw e; }));
const publicBottle = (b) => ({ id: b.id, message: b.message, paper: b.paper, x: b.x, y: b.y, starter: !!b.starter, createdAt: b.created_at });

const publicDuck = (d) => ({ id: d.id, color: d.color, accessory: d.accessory, starter: !!d.starter, createdAt: d.created_at });

function cleanMessage(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

const releaseLog = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (releaseLog.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 6) { releaseLog.set(ip, recent); return true; }
  recent.push(now); releaseLog.set(ip, recent); return false;
}

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'");
  next();
});

app.use('/api', (req, res, next) => whenReady().then(() => next(), next));
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

app.get('/api/ducks', wrap(async (req, res) => {
  const since = Number(req.query.since) || 0;
  const rows = await db.all('SELECT * FROM ducks WHERE hidden = 0 AND id > ? ORDER BY id DESC LIMIT 1000', [since]);
  const hidden = since ? (await db.all('SELECT id FROM ducks WHERE hidden = 1')).map((r) => r.id) : [];
  res.set('Cache-Control', 'no-store');
  res.json({ ducks: rows.map(publicDuck), hidden, now: Date.now() });
}));

app.get('/api/ducks/:id', wrap(async (req, res) => {
  const d = await db.get('SELECT * FROM ducks WHERE id = ? AND hidden = 0', [Number(req.params.id) || 0]);
  if (!d) return res.status(404).json({ error: 'That duck has swum away.' });
  res.json({ duck: publicDuck(d) });
}));

app.post('/api/ducks', wrap(async (req, res) => {
  const { color, accessory } = req.body || {};
  if (!COLORS.includes(color)) return res.status(400).json({ error: 'Pick a duck color.' });
  if (!ACCESSORIES.includes(accessory)) return res.status(400).json({ error: 'Pick an accessory.' });
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'The pond needs a moment. Try releasing again in a few minutes.' });
  const id = await db.insert('INSERT INTO ducks (color, accessory, message, created_at) VALUES (?, ?, ?, ?)', [color, accessory, '', Date.now()]);
  const d = await db.get('SELECT * FROM ducks WHERE id = ?', [id]);
  res.status(201).json({ duck: publicDuck(d) });
}));

app.post('/api/ducks/:id/report', wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const reporter = String((req.body || {}).visitor || '').slice(0, 64) || req.ip;
  const reason = String((req.body || {}).reason || '').slice(0, 200);
  const d = await db.get('SELECT id FROM ducks WHERE id = ?', [id]);
  if (!d) return res.status(404).json({ error: 'Duck not found.' });
  await db.run(db.insertIgnore('INSERT INTO reports (duck_id, reporter, reason, created_at) VALUES (?, ?, ?, ?)'), [id, `${reporter}|${req.ip}`, reason, Date.now()]);
  const n = Number((await db.get('SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE duck_id = ?', [id])).n);
  if (n >= REPORT_HIDE_THRESHOLD) await db.run('UPDATE ducks SET hidden = 1 WHERE id = ?', [id]);
  res.json({ ok: true });
}));

app.get('/api/bottles', wrap(async (req, res) => {
  const since = Number(req.query.since) || 0;
  const rows = await db.all('SELECT * FROM bottles WHERE hidden = 0 AND id > ? ORDER BY id DESC LIMIT 500', [since]);
  const hidden = since ? (await db.all('SELECT id FROM bottles WHERE hidden = 1')).map((r) => r.id) : [];
  res.set('Cache-Control', 'no-store');
  res.json({ bottles: rows.map(publicBottle), hidden });
}));

app.post('/api/bottles', wrap(async (req, res) => {
  const body = req.body || {};
  const message = cleanMessage(body.message);
  const x = Number(body.x), y = Number(body.y);
  if (!PAPERS.includes(body.paper)) return res.status(400).json({ error: 'Pick some letter paper.' });
  if (!message) return res.status(400).json({ error: 'Write your letter first.' });
  if ([...message].length > MAX_LETTER) return res.status(400).json({ error: `Letters can be up to ${MAX_LETTER} characters.` });
  if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({ error: 'Throw the bottle into the pond.' });
  if (rateLimited(`bottle:${req.ip}`)) return res.status(429).json({ error: 'The pond needs a moment. Try throwing again in a few minutes.' });
  const clampPos = (v) => Math.min(0.92, Math.max(0.08, v));
  const id = await db.insert('INSERT INTO bottles (message, paper, x, y, created_at) VALUES (?, ?, ?, ?, ?)', [message, body.paper, clampPos(x), clampPos(y), Date.now()]);
  res.status(201).json({ bottle: publicBottle(await db.get('SELECT * FROM bottles WHERE id = ?', [id])) });
}));

app.post('/api/bottles/:id/report', wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const reporter = String((req.body || {}).visitor || '').slice(0, 64) || req.ip;
  if (!(await db.get('SELECT id FROM bottles WHERE id = ?', [id]))) return res.status(404).json({ error: 'Bottle not found.' });
  await db.run(db.insertIgnore('INSERT INTO bottle_reports (bottle_id, reporter, reason, created_at) VALUES (?, ?, ?, ?)'), [id, `${reporter}|${req.ip}`, String((req.body || {}).reason || '').slice(0, 200), Date.now()]);
  const n = Number((await db.get('SELECT COUNT(DISTINCT reporter) AS n FROM bottle_reports WHERE bottle_id = ?', [id])).n);
  if (n >= REPORT_HIDE_THRESHOLD) await db.run('UPDATE bottles SET hidden = 1 WHERE id = ?', [id]);
  res.json({ ok: true });
}));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use('/api', (err, req, res, next) => { console.error(err); res.status(500).json({ error: 'The pond is having a moment. Try again soon.' }); });

module.exports = app;
if (require.main === module) app.listen(PORT, () => console.log(`Duck pond on http://localhost:${PORT} (${db.kind})`));
