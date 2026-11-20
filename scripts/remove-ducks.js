// Usage: DATA_DIR=... node scripts/remove-ducks.js <id> [id...]   |   --list   |   --match "text"
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'ducks.db'));
const args = process.argv.slice(2);
if (args[0] === '--list' || !args.length) {
  for (const d of db.prepare('SELECT id, color, accessory, starter, hidden, message FROM ducks ORDER BY id').all()) console.log(d);
} else if (args[0] === '--match') {
  const rows = db.prepare('SELECT id FROM ducks WHERE starter = 0 AND message LIKE ?').all(`%${args[1]}%`);
  for (const r of rows) { db.prepare('DELETE FROM reports WHERE duck_id = ?').run(r.id); db.prepare('DELETE FROM ducks WHERE id = ?').run(r.id); }
  console.log(`removed ${rows.length} duck(s)`);
} else {
  for (const id of args.map(Number)) { db.prepare('DELETE FROM reports WHERE duck_id = ?').run(id); db.prepare('DELETE FROM ducks WHERE id = ?').run(id); }
  console.log('removed', args.join(', '));
}
