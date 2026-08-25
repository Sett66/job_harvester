// Read-only: list messages in Deleted Messages (headers only, no bodies)
const path = require('path');
const serverRoot = 'E:/job_harvester/apps/server';

async function main() {
  const keytar = require(path.join(serverRoot, 'node_modules/keytar'));
  const found = await keytar.findCredentials('job-harvester.qq-mail');
  const { ImapFlow } = require(path.join(serverRoot, 'node_modules/imapflow'));
  const client = new ImapFlow({
    host: 'imap.qq.com', port: 993, secure: true,
    auth: { user: found[0].account, pass: found[0].password },
    logger: false, disableAutoIdle: true,
    clientInfo: { name: 'job-harvester', version: '1.0.0', vendor: 'job-harvester' },
  });

  try {
    await client.connect();
    if (!client.capabilities.has('ID')) client.capabilities.set('ID', true);
    await client.run('ID', { name: 'job-harvester', version: '1.0.0', vendor: 'job-harvester' });

    const lock = await client.getMailboxLock('Deleted Messages');
    try {
      const uids = await client.search({}, { uid: true });
      console.log('Deleted Messages total:', uids.length);
      for await (const m of client.fetch(uids, { uid: true, envelope: true, internalDate: true }, { uid: true })) {
        console.log(JSON.stringify({
          uid: m.uid,
          internalDate: m.internalDate ? m.internalDate.toISOString() : null,
          date: m.envelope?.date,
          from: m.envelope?.from?.map((f) => `${f.name || ''} <${f.address || ''}>`).join(','),
          subject: m.envelope?.subject,
        }));
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { client.close(); }
  }
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
