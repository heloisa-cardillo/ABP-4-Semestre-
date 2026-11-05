/**
 * Dados iniciais. Idempotente: pode rodar quantas vezes quiser sem duplicar nada.
 * Uso: npx prisma db seed
 */
import { createPrismaClient } from '../src/config/database.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PasswordHasher } from '../src/services/password-hasher.js';

const databaseUrl = requireEnv('DATABASE_URL');
const adminEmail = requireEnv('SEED_ADMIN_EMAIL').trim().toLowerCase();
const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');

const prisma = createPrismaClient(databaseUrl);
const hasher = new PasswordHasher();

async function main(): Promise<void> {
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Administrador',
      email: adminEmail,
      passwordHash: await hasher.hash(adminPassword),
      role: Role.ADMIN,
    },
  });
  console.info(`Administrador pronto: ${admin.email}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} para rodar o seed.`);
  return value;
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
