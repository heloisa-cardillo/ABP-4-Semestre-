import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { createContainer, type AppContainer } from '../src/container.js';
import type { PrismaClient, User } from '../src/generated/prisma/client.js';
import { Role } from '../src/generated/prisma/enums.js';
import type { Session } from '../src/models/auth.schemas.js';

export const PASSWORD = 'Senha@12345';

export interface TestContext {
  app: Express;
  container: AppContainer;
}

export function createTestContext(envOverrides: Record<string, string> = {}): TestContext {
  const env = loadEnv({ ...process.env, ...envOverrides });
  const container = createContainer(env, createLogger(env));
  return { app: createApp(container), container };
}

/** Esvazia todas as tabelas (menos o controle de migrations) entre os testes. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

export function createUser(
  { container }: TestContext,
  overrides: Partial<{ name: string; email: string; role: Role; password: string }> = {},
): Promise<User> {
  return container.services.users.create({
    name: overrides.name ?? 'Pessoa Teste',
    email: overrides.email ?? `pessoa-${randomUUID()}@teste.com`,
    password: overrides.password ?? PASSWORD,
    role: overrides.role ?? Role.RESIDENT,
  });
}

export async function login(app: Express, email: string, password = PASSWORD): Promise<Session> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200)
    throw new Error(`login falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as Session;
}

/** Cria um usuário com o perfil pedido e devolve a sessão dele. */
export async function sessionFor(ctx: TestContext, role: Role = Role.ADMIN) {
  const user = await createUser(ctx, { role });
  const session = await login(ctx.app, user.email);
  return { user, session, auth: `Bearer ${session.accessToken}` };
}
