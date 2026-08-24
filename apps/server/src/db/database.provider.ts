import { Provider } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export const DATABASE = Symbol('DATABASE');

export type AppDatabase = BetterSQLite3Database<typeof schema>;

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), '../../data/app.db');
}

function resolveMigrationsFolder(): string {
  const candidates = [
    path.join(__dirname, '../drizzle'),
    path.join(__dirname, '../../drizzle'),
    path.join(process.cwd(), 'drizzle'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Drizzle migrations folder not found');
}

export function createDatabase(dbPath: string): AppDatabase {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  return db;
}

export const databaseProvider: Provider = {
  provide: DATABASE,
  useFactory: (): AppDatabase => createDatabase(resolveDbPath()),
};
