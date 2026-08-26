const Database = require('E:/job_harvester/node_modules/.pnpm/better-sqlite3@12.11.1/node_modules/better-sqlite3');
const db = new Database('E:/job_harvester/data/app.db', { readonly: true });

console.log('== email ==');
const emails = db.prepare('SELECT id, folder, from_address, subject, received_at, screen_result, parse_status, review_status FROM email ORDER BY received_at').all();
for (const e of emails) {
  console.log(JSON.stringify(e));
}

console.log('\n== sync_state ==');
const states = db.prepare('SELECT * FROM sync_state').all();
for (const s of states) {
  console.log(JSON.stringify(s));
}
