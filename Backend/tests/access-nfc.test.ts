import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../src/generated/prisma/client.js';
import { LocationType, Role } from '../src/generated/prisma/enums.js';
import { addDays, dateToDb, localDate, timeToDb } from '../src/services/local-time.js';
import { createTestContext, createUser, resetDatabase, sessionFor } from './helpers.js';

const ctx = createTestContext();
const { app, container } = ctx;
const db = container.prisma;

let adminAuth: string;
let admin: User;
let ana: User;
let terminalId: string;
let terminalAuth: string;
let turnstileId: string;

beforeEach(async () => {
  await resetDatabase(db);
  const session = await sessionFor(ctx, Role.ADMIN);
  adminAuth = session.auth;
  admin = session.user;
  ana = await createUser(ctx, { name: 'Ana Maria Souza', role: Role.RESIDENT });
  await db.user.update({ where: { id: ana.id }, data: { nfcUid: '04A1B2C3' } });

  const building = await db.location.create({
    data: { type: LocationType.BUILDING, name: 'Edifício', latitude: -23.305, longitude: -45.965 },
  });
  const gatehouse = await db.location.create({
    data: { type: LocationType.GATEHOUSE, name: 'Portaria', parentId: building.id },
  });
  const door = await db.location.create({
    data: { type: LocationType.DOOR, name: 'Porta', parentId: gatehouse.id },
  });
  const turnstile = await db.location.create({
    data: {
      type: LocationType.TURNSTILE,
      name: 'Catraca 1',
      parentId: door.id,
      latitude: -23.30501,
      longitude: -45.96581,
    },
  });
  turnstileId = turnstile.id;
  const created = await request(app)
    .post('/api/v1/terminals')
    .set('Authorization', adminAuth)
    .send({ name: 'Terminal 1', locationId: turnstile.id });
  terminalId = created.body.terminal.id;
  terminalAuth = `Terminal ${created.body.credential}`;
});
afterAll(() => db.$disconnect());

/** Autorização de ontem a amanhã, o dia todo, para a pessoa na catraca. */
function authorize(userId: string) {
  const today = localDate(new Date(), container.env.BUILDING_TIMEZONE);
  return db.authorization.create({
    data: {
      userId,
      locationId: turnstileId,
      startDate: dateToDb(addDays(today, -1)),
      endDate: dateToDb(addDays(today, 1)),
      startTime: timeToDb('00:00:00'),
      endTime: timeToDb('23:59:59'),
      createdById: admin.id,
    },
  });
}

const read = (body: object, auth: string | null = terminalAuth) => {
  const req = request(app).post('/api/v1/access/nfc');
  if (auth) void req.set('Authorization', auth);
  return req.send(body);
};

describe('POST /access/nfc', () => {
  it('tag vinculada e autorização válida: 200 GRANTED, só com o primeiro nome', async () => {
    const auth = await authorize(ana.id);

    const res = await read({ uid: '04:a1:b2:c3' });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      result: 'GRANTED',
      denyReason: null,
      message: 'Acesso liberado',
      eventId: expect.any(String),
      user: { name: 'Ana' },
    });
    // Nada de id ou outros dados da pessoa para o terminal.
    expect(JSON.stringify(res.body)).not.toContain(ana.id);
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event).toMatchObject({
      method: 'NFC',
      result: 'GRANTED',
      userId: ana.id,
      terminalId,
      authorizationId: auth.id,
      credential: '04A1B2C3',
    });
  });

  it('tag desconhecida: 200 DENIED UNKNOWN_USER, evento sem usuário e com o UID', async () => {
    const res = await read({ uid: 'DEADBEEF' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      result: 'DENIED',
      denyReason: 'UNKNOWN_USER',
      message: 'Nao identificado',
      user: null,
    });
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event).toMatchObject({ userId: null, credential: 'DEADBEEF', terminalId });
  });

  it('tag de quem não tem autorização: 200 DENIED NO_AUTHORIZATION', async () => {
    const res = await read({ uid: '04A1B2C3' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: 'DENIED', denyReason: 'NO_AUTHORIZATION' });
  });

  it('sem cabeçalho Terminal ou com JWT de usuário: 401', async () => {
    const none = await read({ uid: '04A1B2C3' }, null);
    const jwt = await read({ uid: '04A1B2C3' }, adminAuth);
    for (const res of [none, jwt]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TERMINAL_CREDENTIAL');
    }
    expect(await db.accessEvent.count()).toBe(0);
  });

  it('terminal desativado: 401 (o middleware barra antes da decisão)', async () => {
    await authorize(ana.id);
    await request(app)
      .patch(`/api/v1/terminals/${terminalId}`)
      .set('Authorization', adminAuth)
      .send({ active: false });

    const res = await read({ uid: '04A1B2C3' });

    expect(res.status).toBe(401);
    expect(await db.accessEvent.count()).toBe(0);
  });

  it.each([
    ['UID mal formado', { uid: 'XYZ' }],
    ['UID de 5 bytes', { uid: '0102030405' }],
    ['sem uid', {}],
    ['campo a mais', { uid: '04A1B2C3', userId: 'x' }],
  ])('%s: 400', async (_case, body) => {
    const res = await read(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await db.accessEvent.count()).toBe(0);
  });

  it('limita as leituras por terminal por minuto (429)', async () => {
    const limited = createTestContext({ TERMINAL_ACCESS_RATE_LIMIT_MAX: '2' });
    const send = () =>
      request(limited.app)
        .post('/api/v1/access/nfc')
        .set('Authorization', terminalAuth)
        .send({ uid: 'DEADBEEF' });

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    await limited.container.prisma.$disconnect();
  });
});
