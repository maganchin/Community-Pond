// Copies ducks, bottles and reports from the local SQLite pond into Postgres (DATABASE_URL), keeping ids.
// Usage: DATA_DIR=... DATABASE_URL=... node scripts/migrate-to-postgres.js
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');
const src = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'ducks.db'));
(async () => {
  const db = require('../db');
  await db.init();
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
  await pg.connect();
  const tables = {
    ducks: ['id', 'color', 'accessory', 'message', 'starter', 'hidden', 'created_at'],
    bottles: ['id', 'message', 'paper', 'x', 'y', 'starter', 'hidden', 'created_at'],
    reports: ['duck_id', 'reporter', 'reason', 'created_at'],
    bottle_reports: ['bottle_id', 'reporter', 'reason', 'created_at'],
  };
  await pg.query('BEGIN');
  for (const [t, cols] of Object.entries(tables)) {
    await pg.query(`DELETE FROM ${t}`);
    const rows = src.prepare(`SELECT ${cols.join(', ')} FROM ${t}`).all();
    for (const r of rows) await pg.query(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((c) => r[c]));
    console.log(t, rows.length);
  }
  for (const t of ['ducks', 'bottles']) await pg.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`);
  await pg.query('COMMIT');
  await pg.end();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
