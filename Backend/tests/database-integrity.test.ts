import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Location, User } from '../src/generated/prisma/client.js';
import {
  AccessMethod,
  AccessResult,
  AuthorizationStatus,
  DenyReason,
  LocationType,
  Role,
} from '../src/generated/prisma/enums.js';
import { createTestContext, createUser, resetDatabase } from './helpers.js';

/**
 * Regras que o próprio banco garante (CHECK e trigger), independentemente da API.
 * Protegem os modelos de autorização (T21) e de evento (T38) antes mesmo de existirem endpoints.
 */
const ctx = createTestContext();
const db = ctx.container.prisma;

let admin: User;
let holder: User;
let turnstile: Location;

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

beforeEach(async () => {
  await resetDatabase(db);
  admin = await createUser(ctx, { role: Role.ADMIN });
  holder = await createUser(ctx, { role: Role.VISITOR });
  const building = await db.location.create({
    data: {
      type: LocationType.BUILDING,
      name: 'Edifício',
      address: 'Rua Exemplo, 100',
      latitude: -23.305,
      longitude: -45.9658,
    },
  });
  const gatehouse = await db.location.create({
    data: { type: LocationType.GATEHOUSE, name: 'Portaria', parentId: building.id },
  });
  const door = await db.location.create({
    data: { type: LocationType.DOOR, name: 'Porta', parentId: gatehouse.id },
  });
  turnstile = await db.location.create({
    data: {
      type: LocationType.TURNSTILE,
      name: 'Catraca',
      parentId: door.id,
      latitude: -23.305,
      longitude: -45.9658,
    },
  });
});
afterAll(() => db.$disconnect());

const authorization = (overrides: Record<string, unknown> = {}) => ({
  userId: holder.id,
  locationId: turnstile.id,
  startDate: date('2026-10-21'),
  endDate: date('2026-11-21'),
  startTime: time('08:00'),
  endTime: time('18:00'),
  maxUses: 10,
  createdById: admin.id,
  ...overrides,
});

describe('autorização (RF03)', () => {
  it('grava uma autorização válida com todos os campos do edital', async () => {
    const created = await db.authorization.create({ data: authorization() });
    expect(created).toMatchObject({
      status: AuthorizationStatus.ACTIVE,
      usesCount: 0,
      maxUses: 10,
    });
    expect(created.startTime.toISOString()).toBe('1970-01-01T08:00:00.000Z');
    expect(created.endDate.toISOString().slice(0, 10)).toBe('2026-11-21');
  });

  it('aceita uso ilimitado (maxUses nulo)', async () => {
    await expect(
      db.authorization.create({ data: authorization({ maxUses: null }) }),
    ).resolves.toMatchObject({ maxUses: null });
  });

  it.each([
    ['término antes do início', { startDate: date('2026-11-21'), endDate: date('2026-10-21') }],
    ['horário final antes do inicial', { startTime: time('18:00'), endTime: time('08:00') }],
    ['limite de usos zero', { maxUses: 0 }],
    ['usos acima do limite', { maxUses: 2, usesCount: 3 }],
    ['cancelada sem data de cancelamento', { status: AuthorizationStatus.CANCELLED }],
    ['data de cancelamento em autorização ativa', { cancelledAt: new Date() }],
  ])('o banco recusa %s', async (_case, overrides) => {
    await expect(db.authorization.create({ data: authorization(overrides) })).rejects.toThrow();
  });
});

describe('locais (RF02)', () => {
  it.each([
    ['latitude sem longitude', { latitude: -23.3, longitude: null }],
    ['latitude fora da faixa', { latitude: 95, longitude: 0 }],
    ['portaria sem local de cima', { type: LocationType.GATEHOUSE, parentId: null }],
  ])('o banco recusa %s', async (_case, overrides) => {
    await expect(
      db.location.create({
        data: { type: LocationType.BUILDING, name: 'X', ...overrides },
      }),
    ).rejects.toThrow();
  });
});

describe('evento de acesso (RF17)', () => {
  const event = (overrides: Record<string, unknown> = {}) => ({
    method: AccessMethod.NFC,
    result: AccessResult.DENIED,
    denyReason: DenyReason.UNKNOWN_USER,
    credential: '04:A2:3B:1C',
    locationId: turnstile.id,
    ...overrides,
  });

  it('registra tentativa negada com motivo e liberada sem motivo', async () => {
    await expect(db.accessEvent.create({ data: event() })).resolves.toBeDefined();
    await expect(
      db.accessEvent.create({
        data: event({
          method: AccessMethod.QR,
          result: AccessResult.GRANTED,
          denyReason: null,
          userId: holder.id,
          latitude: -23.30502,
          longitude: -45.96582,
          distanceMeters: 2.1,
        }),
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['negada sem motivo', { denyReason: null }],
    ['liberada com motivo', { result: AccessResult.GRANTED }],
    ['distância negativa', { distanceMeters: -1 }],
  ])('o banco recusa evento %s', async (_case, overrides) => {
    await expect(db.accessEvent.create({ data: event(overrides) })).rejects.toThrow();
  });

  it('o histórico é imutável: UPDATE e DELETE são recusados pelo banco', async () => {
    const created = await db.accessEvent.create({ data: event() });

    await expect(
      db.accessEvent.update({ where: { id: created.id }, data: { credential: 'adulterado' } }),
    ).rejects.toThrow(/imutável/);
    await expect(db.accessEvent.delete({ where: { id: created.id } })).rejects.toThrow(/imutável/);

    const stored = await db.accessEvent.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.credential).toBe('04:A2:3B:1C');
  });
});
