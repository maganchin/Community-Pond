// Usage: DATA_DIR=... node scripts/remove-bottles.js --list | --match "text" | <id> [id...]
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'ducks.db'));
const args = process.argv.slice(2);
if (args[0] === '--list') {
  for (const b of db.prepare('SELECT id, paper, starter, hidden, message FROM bottles ORDER BY id').all()) console.log(b.id, b.paper, b.starter ? 'starter' : '', b.hidden ? 'hidden' : '', '|', b.message.slice(0, 60));
  process.exit(0);
}
const ids = args[0] === '--match'
  ? db.prepare('SELECT id FROM bottles WHERE message LIKE ? AND starter = 0').all(`%${args[1]}%`).map((r) => r.id)
  : args.map(Number).filter(Boolean);
for (const id of ids) {
  db.prepare('DELETE FROM bottle_reports WHERE bottle_id = ?').run(id);
  db.prepare('DELETE FROM bottles WHERE id = ?').run(id);
}
console.log(`removed ${ids.length} bottle(s)`, ids.join(' '));
