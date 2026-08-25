export const MAIL_CREDENTIALS_STORE = Symbol('MAIL_CREDENTIALS_STORE');

export const MAIL_CREDENTIALS_SERVICE = 'job-harvester.qq-mail';

export type MailCredentials = {
  address: string;
  authCode: string;
};

export type MailCredentialsStore = {
  get(): Promise<MailCredentials | null>;
  set(credentials: MailCredentials): Promise<void>;
  deleteAll(): Promise<void>;
};

type KeytarModule = {
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

function loadKeytar(): KeytarModule {
  try {
    // 延迟加载：避免未执行同步时就加载原生模块
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('keytar') as KeytarModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法加载系统凭据管理器（keytar）：${message}`);
  }
}

export class KeytarCredentialsStore implements MailCredentialsStore {
  constructor(private readonly service = MAIL_CREDENTIALS_SERVICE) {}

  async get(): Promise<MailCredentials | null> {
    const keytar = loadKeytar();
    const found = await keytar.findCredentials(this.service);
    const first = found[0];
    if (!first?.account || !first.password) {
      return null;
    }
    return { address: first.account, authCode: first.password };
  }

  async set(credentials: MailCredentials): Promise<void> {
    const address = credentials.address.trim();
    const authCode = credentials.authCode.trim();
    if (!address || !authCode) {
      throw new Error('邮箱地址和授权码都不能为空');
    }

    await this.deleteAll();
    const keytar = loadKeytar();
    await keytar.setPassword(this.service, address, authCode);
  }

  async deleteAll(): Promise<void> {
    const keytar = loadKeytar();
    const found = await keytar.findCredentials(this.service);
    for (const item of found) {
      await keytar.deletePassword(this.service, item.account);
    }
  }
}

export class MemoryCredentialsStore implements MailCredentialsStore {
  private current: MailCredentials | null = null;

  async get(): Promise<MailCredentials | null> {
    return this.current;
  }

  async set(credentials: MailCredentials): Promise<void> {
    this.current = {
      address: credentials.address.trim(),
      authCode: credentials.authCode.trim(),
    };
  }

  async deleteAll(): Promise<void> {
    this.current = null;
  }
}

export function createKeytarCredentialsStore(): MailCredentialsStore {
  return new KeytarCredentialsStore();
}
