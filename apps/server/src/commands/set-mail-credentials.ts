import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { KeytarCredentialsStore } from '../modules/mail/credentials';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const matched = process.argv.find((item) => item.startsWith(prefix));
  if (matched) {
    return matched.slice(prefix.length);
  }
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    return process.argv[index + 1];
  }
  return undefined;
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const address =
    readArg('address') || (await prompt('QQ 邮箱地址（例如 name@qq.com）：'));
  const authCode = readArg('auth-code') || (await prompt('授权码：'));

  if (!address || !authCode) {
    throw new Error('邮箱地址和授权码都不能为空');
  }

  const store = new KeytarCredentialsStore();
  await store.set({ address, authCode });

  console.log(`已写入系统凭据管理器：${address}`);
  console.log('授权码不会写入 .env 或数据库。');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
