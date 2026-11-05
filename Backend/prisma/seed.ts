/**
 * Dados iniciais. Idempotente: pode rodar quantas vezes quiser sem duplicar nada.
 * Uso: npx prisma db seed
 *
 * Sempre cria o administrador (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
 * Com SEED_DEMO_PASSWORD definido, cria também os dados de demonstração da Sprint Review:
 * um edifício completo, um terminal, um condômino, um visitante, autorizações e eventos.
 */
import { createPrismaClient } from '../src/config/database.js';
import {
  AccessMethod,
  AccessResult,
  DenyReason,
  LocationType,
  Role,
} from '../src/generated/prisma/enums.js';
import { PasswordHasher } from '../src/services/password-hasher.js';
import { generateOpaqueToken, sha256 } from '../src/services/token.service.js';

const databaseUrl = requireEnv('DATABASE_URL');
const adminEmail = requireEnv('SEED_ADMIN_EMAIL').trim().toLowerCase();
const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');
const demoPassword = process.env.SEED_DEMO_PASSWORD;

const prisma = createPrismaClient(databaseUrl);
const hasher = new PasswordHasher();

/** Ids fixos: é o que torna o seed idempotente para registros sem chave natural. */
const ID = {
  building: '019a0000-0000-7000-8000-000000000001',
  gatehouse: '019a0000-0000-7000-8000-000000000002',
  door: '019a0000-0000-7000-8000-000000000003',
  turnstile: '019a0000-0000-7000-8000-000000000004',
  terminal: '019a0000-0000-7000-8000-000000000101',
  residentAuthorization: '019a0000-0000-7000-8000-000000000201',
  visitorAuthorization: '019a0000-0000-7000-8000-000000000202',
};

/** Coordenadas de demonstração em Jacareí/SP. */
const SITE = { latitude: -23.305, longitude: -45.9658 };

async function main(): Promise<void> {
  const admin = await upsertUser('Administrador', adminEmail, adminPassword, Role.ADMIN);
  console.info(`Administrador: ${admin.email}`);

  if (!demoPassword) {
    console.info('SEED_DEMO_PASSWORD não definido: dados de demonstração não criados.');
    return;
  }
  await seedDemo(admin.id, demoPassword);
}

async function seedDemo(adminId: string, password: string): Promise<void> {
  const resident = await upsertUser(
    'Carla Condômina',
    'condomino@acesso.local',
    password,
    Role.RESIDENT,
  );
  const visitor = await upsertUser(
    'Vitor Visitante',
    'visitante@acesso.local',
    password,
    Role.VISITOR,
  );

  await upsertLocation(ID.building, {
    type: LocationType.BUILDING,
    name: 'Edifício Comercial Central',
    address: 'Rua de Demonstração, 100 - Centro, Jacareí/SP',
    ...SITE,
  });
  await upsertLocation(ID.gatehouse, {
    type: LocationType.GATEHOUSE,
    name: 'Portaria Principal',
    parentId: ID.building,
  });
  await upsertLocation(ID.door, {
    type: LocationType.DOOR,
    name: 'Acesso ao Elevador Social',
    parentId: ID.gatehouse,
  });
  await upsertLocation(ID.turnstile, {
    type: LocationType.TURNSTILE,
    name: 'Catraca 1',
    parentId: ID.door,
    latitude: SITE.latitude + 0.00002,
    longitude: SITE.longitude + 0.00002,
  });

  // A credencial só pode ser mostrada quando é gerada. Se o terminal já existe, ela não muda.
  const existingTerminal = await prisma.terminal.findUnique({ where: { id: ID.terminal } });
  if (existingTerminal) {
    console.info('Terminal já existe. Nova credencial: POST /api/v1/terminals/{id}/credential');
  } else {
    const secret = generateOpaqueToken();
    await prisma.terminal.create({
      data: {
        id: ID.terminal,
        name: 'Terminal Catraca 1',
        locationId: ID.turnstile,
        secretHash: sha256(secret),
      },
    });
    console.info(`Credencial do terminal (grave no firmware): ${ID.terminal}.${secret}`);
  }

  const today = new Date();
  const inDays = (days: number) => dateOnly(new Date(today.getTime() + days * 86_400_000));

  // Condômino: o edifício inteiro, o ano todo, sem limite de usos.
  await prisma.authorization.upsert({
    where: { id: ID.residentAuthorization },
    update: {},
    create: {
      id: ID.residentAuthorization,
      userId: resident.id,
      locationId: ID.building,
      startDate: inDays(0),
      endDate: inDays(365),
      startTime: timeOfDay('00:00'),
      endTime: timeOfDay('23:59'),
      maxUses: null,
      createdById: adminId,
    },
  });

  // Visitante: só a catraca, por uma semana, em horário comercial, até 10 entradas.
  await prisma.authorization.upsert({
    where: { id: ID.visitorAuthorization },
    update: {},
    create: {
      id: ID.visitorAuthorization,
      userId: visitor.id,
      locationId: ID.turnstile,
      startDate: inDays(0),
      endDate: inDays(7),
      startTime: timeOfDay('08:00'),
      endTime: timeOfDay('18:00'),
      maxUses: 10,
      createdById: adminId,
    },
  });

  // Eventos de exemplo para as telas de histórico. Só na primeira vez: o histórico é imutável.
  if ((await prisma.accessEvent.count()) === 0) {
    await prisma.accessEvent.createMany({
      data: [
        {
          method: AccessMethod.QR,
          result: AccessResult.GRANTED,
          userId: resident.id,
          terminalId: ID.terminal,
          locationId: ID.turnstile,
          authorizationId: ID.residentAuthorization,
          latitude: SITE.latitude,
          longitude: SITE.longitude,
          distanceMeters: 3.1,
        },
        {
          method: AccessMethod.NFC,
          result: AccessResult.DENIED,
          denyReason: DenyReason.UNKNOWN_USER,
          terminalId: ID.terminal,
          locationId: ID.turnstile,
          credential: '04:A2:3B:1C:5D:80:00',
        },
      ],
    });
  }

  console.info(`Demonstração pronta: ${resident.email} e ${visitor.email}`);
}

async function upsertUser(name: string, email: string, password: string, role: Role) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, role, passwordHash: await hasher.hash(password) },
  });
}

async function upsertLocation(
  id: string,
  data: {
    type: LocationType;
    name: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    parentId?: string;
  },
) {
  return prisma.location.upsert({ where: { id }, update: {}, create: { id, ...data } });
}

function dateOnly(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00Z`);
}

function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
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
