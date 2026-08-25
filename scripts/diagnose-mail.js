// Read-only diagnostic: list folders + run SEARCH per folder to see what the
// QQ IMAP server actually returns for the sync window. Does NOT fetch bodies,
// does NOT write anything to the mailbox.
const path = require('path');
const root = 'E:/job_harvester';
const serverRoot = path.join(root, 'apps/server');

async function main() {
  let keytar;
  try {
    keytar = require(path.join(serverRoot, 'node_modules/keytar'));
  } catch (e) {
    console.log('keytar load failed:', e.message);
    return;
  }
  const found = await keytar.findCredentials('job-harvester.qq-mail');
  if (!found || found.length === 0) {
    console.log('no credentials found for service job-harvester.qq-mail');
    return;
  }
  console.log('found credential account:', found[0].account);
  console.log('password length:', found[0].password.length);

  const { ImapFlow } = require(path.join(serverRoot, 'node_modules/imapflow'));
  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: { user: found[0].account, pass: found[0].password },
    logger: false,
    disableAutoIdle: true,
    clientInfo: { name: 'job-harvester', version: '1.0.0', vendor: 'job-harvester' },
  });

  try {
    await client.connect();
    // QQ requires the ID command after login
    if (!client.capabilities.has('ID')) client.capabilities.set('ID', true);
    await client.run('ID', { name: 'job-harvester', version: '1.0.0', vendor: 'job-harvester' });
    console.log('connected + ID ok');

    const boxes = await client.list();
    console.log('\n=== ALL SERVER FOLDERS ===');
    for (const b of boxes) console.log(`  path=${JSON.stringify(b.path)} name=${JSON.stringify(b.name)}`);

    const folders = boxes.map((b) => b.path).filter(Boolean);

    const sinceConfig = new Date('2026-03-01T00:00:00+08:00'); // what the app sends
    const sinceUtc = new Date(sinceConfig.getTime()); // formatted in UTC by imapflow
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    console.log('\n=== SEARCH RESULTS PER FOLDER ===');
    for (const folder of folders) {
      const lock = await client.getMailboxLock(folder);
      try {
        const all = await client.search({ since: sinceConfig }, { uid: true });
        const uids = Array.isArray(all) ? all : [];
        const s30 = await client.search({ since: since30 }, { uid: true });
        const uids30 = Array.isArray(s30) ? s30 : [];
        const total = await client.search({}, { uid: true });
        const totalUids = Array.isArray(total) ? total : [];
        console.log(`\nfolder=${JSON.stringify(folder)}`);
        console.log(`  total msgs (all search): ${totalUids.length}  uid range: ${totalUids.length ? Math.min(...totalUids) + '..' + Math.max(...totalUids) : '-'}`);
        console.log(`  SINCE 2026-03-01 (app window): ${uids.length}  uid range: ${uids.length ? Math.min(...uids) + '..' + Math.max(...uids) : '-'}`);
        console.log(`  SINCE last-30d: ${uids30.length}  uid range: ${uids30.length ? Math.min(...uids30) + '..' + Math.max(...uids30) : '-'}`);
      } finally {
        lock.release();
      }
    }
  } finally {
    try { await client.logout(); } catch { client.close(); }
    console.log('\ndone');
  }
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
