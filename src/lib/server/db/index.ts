import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

const dbPath = env.DATABASE_URL || './data/streamx.db';

function createDb() {
	mkdirSync(dirname(dbPath), { recursive: true });
	const client = new Database(dbPath);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	const db = drizzle(client, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	return db;
}

// Avoid opening the database during `vite build` prerendering
export const db = building ? (null as unknown as ReturnType<typeof createDb>) : createDb();
