// Tiny async DB layer: Postgres when DATABASE_URL is set (Vercel + Supabase), SQLite otherwise (local).
const path = require('path');
const fs = require('fs');

const SCHEMA = (pg) => {
  const id = pg ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
  const big = pg ? 'BIGINT' : 'INTEGER';
  const real = pg ? 'DOUBLE PRECISION' : 'REAL';
  return [
    `CREATE TABLE IF NOT EXISTS ducks (${id}, color TEXT NOT NULL, accessory TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', starter INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created_at ${big} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS reports (duck_id INTEGER NOT NULL, reporter TEXT NOT NULL, reason TEXT, created_at ${big} NOT NULL, PRIMARY KEY (duck_id, reporter))`,
    `CREATE TABLE IF NOT EXISTS bottles (${id}, message TEXT NOT NULL, paper TEXT NOT NULL, x ${real} NOT NULL, y ${real} NOT NULL, starter INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created_at ${big} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS bottle_reports (bottle_id INTEGER NOT NULL, reporter TEXT NOT NULL, reason TEXT, created_at ${big} NOT NULL, PRIMARY KEY (bottle_id, reporter))`,
  ];
};

function postgres(url) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, (v) => Number(v));
  const pool = new Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const q = (sql, params = []) => pool.query(toPg(sql), params);
  return {
    kind: 'postgres',
    async init() { for (const s of SCHEMA(true)) await q(s); },
    async all(sql, p) { return (await q(sql, p)).rows; },
    async get(sql, p) { return (await q(sql, p)).rows[0]; },
    async insert(sql, p) { return (await q(`${sql} RETURNING id`, p)).rows[0].id; },
    async run(sql, p) { await q(sql, p); },
    insertIgnore: (sql) => `${sql} ON CONFLICT DO NOTHING`,
  };
}

function sqlite(dir) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'ducks.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  return {
    kind: 'sqlite',
    async init() { for (const s of SCHEMA(false)) db.exec(s); },
    async all(sql, p = []) { return db.prepare(sql).all(...p); },
    async get(sql, p = []) { return db.prepare(sql).get(...p); },
    async insert(sql, p = []) { return Number(db.prepare(sql).run(...p).lastInsertRowid); },
    async run(sql, p = []) { db.prepare(sql).run(...p); },
    insertIgnore: (sql) => sql.replace(/^INSERT/, 'INSERT OR IGNORE'),
  };
}

module.exports = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL)
  : sqlite(process.env.DATA_DIR || path.join(__dirname, 'data'));
