import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Location, Prisma, Terminal, User } from '../src/generated/prisma/client.js';
import {
  AccessMethod,
  AuthorizationStatus,
  DenyReason,
  LocationType,
  Role,
} from '../src/generated/prisma/enums.js';
import { LocationRepository } from '../src/repositories/location.repository.js';
import type { AccessAttempt } from '../src/services/access-decision.js';
import { dateToDb, localDate, timeToDb, type Clock } from '../src/services/local-time.js';
import { createTestContext, createUser, resetDatabase } from './helpers.js';

const SP = 'America/Sao_Paulo';
/** 12:00 em São Paulo de 10/11/2026. */
const NOON = new Date('2026-11-10T15:00:00Z');

let current = NOON;
const clock: Clock = { now: () => current, today: () => localDate(current, SP) };

const ctx = createTestContext({ BUILDING_TIMEZONE: SP }, { clock });
const { container } = ctx;
const db = container.prisma;
const service = container.services.accessDecision;

const TURNSTILE_POSITION = { latitude: -23.30501, longitude: -45.96581 };
/** Ponto `meters` metros ao norte da catraca (1° de latitude ≈ 111 195 m). */
const north = (meters: number) => ({
  latitude: TURNSTILE_POSITION.latitude + meters / 111_195.08,
  longitude: TURNSTILE_POSITION.longitude,
});

let admin: User;
let person: User;
let building: Location;
let turnstile: Location;
let otherBuilding: Location;
let terminal: Terminal;

async function chain(name: string, latitude: number, longitude: number) {
  const b = await db.location.create({
    data: { type: LocationType.BUILDING, name, address: 'Rua X, 1', latitude, longitude },
  });
  const g = await db.location.create({
    data: { type: LocationType.GATEHOUSE, name: `${name} portaria`, parentId: b.id },
  });
  const d = await db.location.create({
    data: { type: LocationType.DOOR, name: `${name} porta`, parentId: g.id },
  });
  const t = await db.location.create({
    data: {
      type: LocationType.TURNSTILE,
      name: `${name} catraca`,
      parentId: d.id,
      latitude,
      longitude,
    },
  });
  return { building: b, gatehouse: g, door: d, turnstile: t };
}

beforeEach(async () => {
  await resetDatabase(db);
  current = NOON;
  admin = await createUser(ctx, { role: Role.ADMIN });
  person = await createUser(ctx, { name: 'Ana Souza', role: Role.VISITOR });
  ({ building, turnstile } = await chain(
    'Edifício A',
    TURNSTILE_POSITION.latitude,
    TURNSTILE_POSITION.longitude,
  ));
  ({ building: otherBuilding } = await chain('Edifício B', -23.2, -45.9));
  terminal = await db.terminal.create({
    data: { name: 'Terminal A', locationId: turnstile.id, secretHash: '0'.repeat(64) },
  });
});
afterAll(() => db.$disconnect());

/** Autorização do mês inteiro, o dia todo, sem limite de usos, na catraca A. */
function authorize(overrides: Partial<Prisma.AuthorizationUncheckedCreateInput> = {}) {
  return db.authorization.create({
    data: {
      userId: person.id,
      locationId: turnstile.id,
      startDate: dateToDb('2026-11-01'),
      endDate: dateToDb('2026-11-30'),
      startTime: timeToDb('00:00:00'),
      endTime: timeToDb('23:59:59'),
      createdById: admin.id,
      ...overrides,
    },
  });
}

/** Campos de uma autorização cancelada (o banco exige quem e quando cancelou). */
const cancelled = () => ({
  status: AuthorizationStatus.CANCELLED,
  cancelledAt: NOON,
  cancelledById: admin.id,
});

const decide = (overrides: Partial<AccessAttempt> = {}) =>
  service.decide({
    method: AccessMethod.NFC,
    terminalId: terminal.id,
    userId: person.id,
    credential: '04A1B2C3',
    ...overrides,
  });

const qr = (
  position: NonNullable<AccessAttempt['position']>,
  overrides: Partial<AccessAttempt> = {},
) => decide({ method: AccessMethod.QR, credential: randomUUID(), position, ...overrides });

const usesOf = async (id: string) =>
  (await db.authorization.findUniqueOrThrow({ where: { id } })).usesCount;

describe('acesso liberado', () => {
  it('autorização na própria catraca: GRANTED, gasta um uso e grava o evento', async () => {
    const auth = await authorize({ maxUses: 5 });

    const decision = await decide();

    expect(decision).toMatchObject({
      result: 'GRANTED',
      denyReason: null,
      message: 'Acesso liberado',
      authorizationId: auth.id,
      user: { id: person.id, name: 'Ana Souza' },
      distanceMeters: null,
    });
    expect(await usesOf(auth.id)).toBe(1);
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: decision.eventId } });
    expect(event).toMatchObject({
      method: 'NFC',
      result: 'GRANTED',
      denyReason: null,
      userId: person.id,
      terminalId: terminal.id,
      locationId: turnstile.id,
      authorizationId: auth.id,
      credential: '04A1B2C3',
    });
    expect(event.occurredAt.toISOString()).toBe(NOON.toISOString());
  });

  it('autorização no edifício libera a catraca dele', async () => {
    const auth = await authorize({ locationId: building.id });
    const decision = await decide();
    expect(decision.result).toBe('GRANTED');
    expect(decision.authorizationId).toBe(auth.id);
  });

  it('autorização sem limite de usos continua contando os usos', async () => {
    const auth = await authorize({ maxUses: null });
    await decide();
    await decide();
    expect(await usesOf(auth.id)).toBe(2);
  });
});

describe('cada motivo de negação (tabela 5.2)', () => {
  it.each([
    DenyReason.INVALID_CREDENTIAL,
    DenyReason.EXPIRED_CREDENTIAL,
    DenyReason.CREDENTIAL_ALREADY_USED,
  ])('0. presetDeny %s: nega sem aplicar as regras nem gastar uso', async (reason) => {
    const auth = await authorize();

    const decision = await qr(TURNSTILE_POSITION, { presetDeny: reason });

    expect(decision).toMatchObject({ result: 'DENIED', denyReason: reason });
    expect(await usesOf(auth.id)).toBe(0);
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: decision.eventId } });
    expect(event).toMatchObject({ result: 'DENIED', denyReason: reason, userId: person.id });
  });

  it('0. presetDeny sem terminal (QR forjado): evento sem terminal nem local', async () => {
    const decision = await qr(TURNSTILE_POSITION, {
      terminalId: null,
      presetDeny: DenyReason.INVALID_CREDENTIAL,
    });
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: decision.eventId } });
    expect(event).toMatchObject({ terminalId: null, locationId: null, userId: person.id });
  });

  it('1. terminal desativado: TERMINAL_INACTIVE', async () => {
    await authorize();
    await db.terminal.update({ where: { id: terminal.id }, data: { active: false } });
    expect((await decide()).denyReason).toBe('TERMINAL_INACTIVE');
  });

  it('1. catraca desativada: TERMINAL_INACTIVE', async () => {
    await authorize();
    await db.location.update({ where: { id: turnstile.id }, data: { active: false } });
    expect((await decide()).denyReason).toBe('TERMINAL_INACTIVE');
  });

  it('1. terminal inexistente ou nulo: TERMINAL_INACTIVE, com o evento sem terminal', async () => {
    await authorize();
    const missing = await decide({ terminalId: randomUUID() });
    const none = await decide({ terminalId: null });

    for (const decision of [missing, none]) {
      expect(decision.denyReason).toBe('TERMINAL_INACTIVE');
      const event = await db.accessEvent.findUniqueOrThrow({ where: { id: decision.eventId } });
      expect(event.terminalId).toBeNull();
    }
  });

  it('2. ninguém identificado (tag desconhecida): UNKNOWN_USER, com o UID no evento', async () => {
    const decision = await decide({ userId: null, credential: 'DEADBEEF' });

    expect(decision).toMatchObject({ result: 'DENIED', denyReason: 'UNKNOWN_USER', user: null });
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: decision.eventId } });
    expect(event).toMatchObject({ userId: null, credential: 'DEADBEEF', terminalId: terminal.id });
  });

  it('2. usuário que não existe: UNKNOWN_USER', async () => {
    const decision = await decide({ userId: randomUUID() });
    expect(decision.denyReason).toBe('UNKNOWN_USER');
  });

  it('3. usuário desativado: USER_INACTIVE', async () => {
    await authorize();
    await db.user.update({ where: { id: person.id }, data: { active: false } });
    expect((await decide()).denyReason).toBe('USER_INACTIVE');
  });

  it('4. QR a mais de 100 m: OUT_OF_RANGE, com posição e distância no evento', async () => {
    await authorize();
    const position = north(150);

    const decision = await qr(position);

    expect(decision.denyReason).toBe('OUT_OF_RANGE');
    expect(decision.distanceMeters).toBeCloseTo(150, 0);
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: decision.eventId } });
    expect(event.latitude).toBe(position.latitude);
    expect(event.longitude).toBe(position.longitude);
    expect(event.distanceMeters).toBeCloseTo(150, 0);
  });

  it('4. QR sem posição: OUT_OF_RANGE', async () => {
    await authorize();
    const decision = await decide({ method: AccessMethod.QR });
    expect(decision.denyReason).toBe('OUT_OF_RANGE');
    expect(decision.distanceMeters).toBeNull();
  });

  it('4. no NFC a distância não é verificada', async () => {
    await authorize();
    expect((await decide()).result).toBe('GRANTED');
  });

  it('5. sem autorização: NO_AUTHORIZATION', async () => {
    expect((await decide()).denyReason).toBe('NO_AUTHORIZATION');
  });

  it('5. autorização em outro edifício: NO_AUTHORIZATION', async () => {
    await authorize({ locationId: otherBuilding.id });
    expect((await decide()).denyReason).toBe('NO_AUTHORIZATION');
  });

  it('5. autorização de outra pessoa não serve: NO_AUTHORIZATION', async () => {
    await authorize({ userId: admin.id });
    expect((await decide()).denyReason).toBe('NO_AUTHORIZATION');
  });

  it('6. autorização cancelada: AUTHORIZATION_CANCELLED', async () => {
    const auth = await authorize(cancelled());
    const decision = await decide();
    expect(decision.denyReason).toBe('AUTHORIZATION_CANCELLED');
    expect(decision.authorizationId).toBe(auth.id);
  });

  it.each([
    ['ainda não começou', '2026-11-11', '2026-11-20'],
    ['já terminou', '2026-11-01', '2026-11-09'],
  ])('7. fora do período (%s): OUTSIDE_DATE_RANGE', async (_case, start, end) => {
    await authorize({ startDate: dateToDb(start), endDate: dateToDb(end) });
    expect((await decide()).denyReason).toBe('OUTSIDE_DATE_RANGE');
  });

  it.each([
    ['antes da janela', '13:00', '18:00'],
    ['depois da janela', '08:00', '11:59:59'],
  ])('8. fora do horário (%s): OUTSIDE_TIME_WINDOW', async (_case, start, end) => {
    await authorize({ startTime: timeToDb(start), endTime: timeToDb(end) });
    expect((await decide()).denyReason).toBe('OUTSIDE_TIME_WINDOW');
  });

  it('8. a janela vale nas duas pontas', async () => {
    await authorize({ startTime: timeToDb('12:00'), endTime: timeToDb('13:00') });
    expect((await decide()).result).toBe('GRANTED');
    current = new Date('2026-11-10T16:00:00Z'); // 13:00:00
    expect((await decide()).result).toBe('GRANTED');
  });

  it('9. usos esgotados: USAGE_LIMIT_REACHED', async () => {
    await authorize({ maxUses: 2, usesCount: 2 });
    expect((await decide()).denyReason).toBe('USAGE_LIMIT_REACHED');
  });
});

describe('fuso do edifício', () => {
  it('23h30 em São Paulo (dia seguinte em UTC) ainda é o último dia da autorização', async () => {
    current = new Date('2026-11-11T02:30:00Z');
    await authorize({
      endDate: dateToDb('2026-11-10'),
      startTime: timeToDb('22:00'),
      endTime: timeToDb('23:59:59'),
    });
    expect((await decide()).result).toBe('GRANTED');
  });

  it('00h30 em São Paulo já é o dia seguinte, mesmo que em UTC seja 03h30', async () => {
    current = new Date('2026-11-11T03:30:00Z');
    await authorize({ endDate: dateToDb('2026-11-10') });
    expect((await decide()).denyReason).toBe('OUTSIDE_DATE_RANGE');
  });
});

describe('limite de usos', () => {
  it('maxUses = 1: a primeira passa e a segunda dá USAGE_LIMIT_REACHED', async () => {
    const auth = await authorize({ maxUses: 1 });
    expect((await decide()).result).toBe('GRANTED');
    expect((await decide()).denyReason).toBe('USAGE_LIMIT_REACHED');
    expect(await usesOf(auth.id)).toBe(1);
  });

  it('leituras simultâneas com maxUses = 1: só uma é liberada', async () => {
    const auth = await authorize({ maxUses: 1 });

    const decisions = await Promise.all(Array.from({ length: 5 }, () => decide()));

    expect(decisions.filter((d) => d.result === 'GRANTED')).toHaveLength(1);
    expect(decisions.filter((d) => d.denyReason === 'USAGE_LIMIT_REACHED')).toHaveLength(4);
    expect(await usesOf(auth.id)).toBe(1);
    expect(await db.accessEvent.count()).toBe(5);
  });
});

describe('GPS no QR', () => {
  it('a 50 m: GRANTED, com a distância gravada', async () => {
    await authorize();
    const decision = await qr(north(50));
    expect(decision.result).toBe('GRANTED');
    expect(decision.distanceMeters).toBeCloseTo(50, 0);
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: decision.eventId } });
    expect(event.distanceMeters).toBeCloseTo(50, 0);
  });

  it('a 99 m passa; a 101 m não', async () => {
    await authorize();
    expect((await qr(north(99))).result).toBe('GRANTED');
    expect((await qr(north(101))).denyReason).toBe('OUT_OF_RANGE');
  });
});

describe('várias autorizações', () => {
  it('usa a que vale: cancelada na catraca, válida no edifício', async () => {
    await authorize(cancelled());
    const valid = await authorize({ locationId: building.id });
    const decision = await decide();
    expect(decision.result).toBe('GRANTED');
    expect(decision.authorizationId).toBe(valid.id);
  });

  it('nenhuma vale: o motivo é o da que chegou mais longe', async () => {
    await authorize(cancelled());
    const window = await authorize({
      locationId: building.id,
      startTime: timeToDb('18:00'),
      endTime: timeToDb('20:00'),
    });
    await authorize({ startDate: dateToDb('2026-12-01'), endDate: dateToDb('2026-12-31') });

    const decision = await decide();

    expect(decision.denyReason).toBe('OUTSIDE_TIME_WINDOW');
    expect(decision.authorizationId).toBe(window.id);
  });

  it('gasta primeiro a autorização sem limite de usos', async () => {
    const limited = await authorize({ maxUses: 1 });
    const unlimited = await authorize({ locationId: building.id });
    const decision = await decide();
    expect(decision.authorizationId).toBe(unlimited.id);
    expect(await usesOf(limited.id)).toBe(0);
  });

  it('com a primeira esgotada, passa para a próxima válida', async () => {
    await authorize({ maxUses: 1, usesCount: 1 });
    const other = await authorize({ locationId: building.id, maxUses: 3 });
    const decision = await decide();
    expect(decision.authorizationId).toBe(other.id);
  });
});

describe('registro do evento', () => {
  it('toda chamada cria exatamente um AccessEvent, liberando ou negando', async () => {
    await authorize({ maxUses: 1 });
    const attempts: Partial<AccessAttempt>[] = [
      {},
      {},
      { userId: null },
      { terminalId: null },
      { presetDeny: DenyReason.EXPIRED_CREDENTIAL },
      { method: AccessMethod.QR, position: north(500) },
    ];

    for (const [i, attempt] of attempts.entries()) {
      await decide(attempt);
      expect(await db.accessEvent.count()).toBe(i + 1);
    }
  });
});

describe('LocationRepository.findAncestorIds', () => {
  it('devolve o local e os de cima, do mais próximo ao edifício', async () => {
    const repository = new LocationRepository(db);
    const ids = await repository.findAncestorIds(turnstile.id);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe(turnstile.id);
    expect(ids[3]).toBe(building.id);
    expect(await repository.findAncestorIds(building.id)).toEqual([building.id]);
    expect(await repository.findAncestorIds(randomUUID())).toEqual([]);
  });
});
