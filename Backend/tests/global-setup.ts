import { execSync } from 'node:child_process';
import pg from 'pg';
import { assertIsTestDatabase, TEST_DATABASE_URL } from './test-env.js';

/**
 * Antes da suíte: garante que o banco de teste existe e aplica as migrations com
 * `migrate deploy`, o mesmo comando usado em produção. Os testes esvaziam as tabelas entre si.
 */
export default async function setup(): Promise<void> {
  assertIsTestDatabase(TEST_DATABASE_URL);
  await createDatabaseIfMissing(TEST_DATABASE_URL);
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}

async function createDatabaseIfMissing(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
  } finally {
    await client.end();
  }
}
