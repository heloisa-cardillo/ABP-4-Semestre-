import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthorizationStatus, LocationType, Role } from '../src/generated/prisma/enums.js';
import { addDays, dateToDb, localDate, timeToDb } from '../src/services/local-time.js';
import {
  createUser,
  login,
  PASSWORD,
  resetDatabase,
  sessionFor,
  createTestContext,
} from './helpers.js';

const ctx = createTestContext();
const { app, container } = ctx;
const db = container.prisma;

const TODAY = localDate(new Date(), container.env.BUILDING_TIMEZONE);
const day = (offset: number) => addDays(TODAY, offset);

let admin: { id: string; auth: string };
let resident: { id: string; email: string };
let buildingId: string;
let turnstileId: string;

beforeEach(async () => {
  await resetDatabase(db);
  const session = await sessionFor(ctx, Role.ADMIN);
  admin = { id: session.user.id, auth: session.auth };
  const user = await createUser(ctx, { role: Role.RESIDENT, name: 'Ana Condômina' });
  resident = { id: user.id, email: user.email };

  const building = await db.location.create({
    data: {
      type: LocationType.BUILDING,
      name: 'Edifício Central',
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
  const turnstile = await db.location.create({
    data: {
      type: LocationType.TURNSTILE,
      name: 'Catraca 1',
      parentId: door.id,
      latitude: -23.30501,
      longitude: -45.96581,
    },
  });
  buildingId = building.id;
  turnstileId = turnstile.id;
});
afterAll(() => db.$disconnect());

const post = (body: object, auth = admin.auth) =>
  request(app).post('/api/v1/authorizations').set('Authorization', auth).send(body);

const list = (query: Record<string, string> = {}, auth = admin.auth) =>
  request(app).get('/api/v1/authorizations').query(query).set('Authorization', auth);

const forResident = (overrides: object = {}) => ({
  userId: resident.id,
  locationId: buildingId,
  startDate: TODAY,
  endDate: day(30),
  ...overrides,
});

/** Grava direto no banco, para montar situações que a API não deixa criar (ex.: já vencida). */
function insert(
  overrides: Partial<{
    userId: string;
    locationId: string;
    startDate: string;
    endDate: string;
    maxUses: number | null;
    usesCount: number;
    status: AuthorizationStatus;
  }> = {},
) {
  const cancelled = overrides.status === AuthorizationStatus.CANCELLED;
  return db.authorization.create({
    data: {
      userId: overrides.userId ?? resident.id,
      locationId: overrides.locationId ?? buildingId,
      startDate: dateToDb(overrides.startDate ?? TODAY),
      endDate: dateToDb(overrides.endDate ?? day(30)),
      startTime: timeToDb('00:00:00'),
      endTime: timeToDb('23:59:59'),
      maxUses: overrides.maxUses ?? null,
      usesCount: overrides.usesCount ?? 0,
      status: overrides.status ?? AuthorizationStatus.ACTIVE,
      createdById: admin.id,
      ...(cancelled && { cancelledAt: new Date(), cancelledById: admin.id }),
    },
  });
}

describe('POST /authorizations', () => {
  it('cria autorização para uma pessoa já cadastrada', async () => {
    const res = await post(
      forResident({
        locationId: turnstileId,
        startTime: '08:00',
        endTime: '18:30',
        maxUses: 10,
      }),
    );

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/authorizations/${res.body.id}`);
    expect(res.body).toMatchObject({
      user: { id: resident.id, name: 'Ana Condômina', role: 'RESIDENT' },
      location: { id: turnstileId, name: 'Catraca 1', type: 'TURNSTILE' },
      startDate: TODAY,
      endDate: day(30),
      startTime: '08:00:00',
      endTime: '18:30:00',
      maxUses: 10,
      usesCount: 0,
      status: 'ACTIVE',
      situation: 'VALID',
      cancelledAt: null,
      cancelReason: null,
      createdById: admin.id,
    });
  });

  it('sem horário e sem limite: vale o dia inteiro, quantas vezes quiser', async () => {
    const res = await post(forResident());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ startTime: '00:00:00', endTime: '23:59:59', maxUses: null });
  });

  it('autorização que começa no futuro fica agendada', async () => {
    const res = await post(forResident({ startDate: day(2), endDate: day(5) }));
    expect(res.status).toBe(201);
    expect(res.body.situation).toBe('SCHEDULED');
  });

  it('cadastra visitante novo junto com a autorização, e ele já consegue entrar no app', async () => {
    const email = `visitante-${randomUUID()}@teste.com`;
    const res = await post({
      visitor: { name: 'Bruno Visitante', email, password: PASSWORD, phone: '12988887777' },
      locationId: turnstileId,
      startDate: TODAY,
      endDate: TODAY,
      maxUses: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Bruno Visitante', role: 'VISITOR' });

    const session = await login(app, email);
    const mine = await request(app)
      .get('/api/v1/me/authorizations')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].id).toBe(res.body.id);
  });

  it('visitante com e-mail já usado: 409 e nada é gravado', async () => {
    const res = await post({
      visitor: { name: 'Repetido', email: resident.email, password: PASSWORD },
      locationId: buildingId,
      startDate: TODAY,
      endDate: TODAY,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
    expect(await db.authorization.count()).toBe(0);
  });

  it.each([
    ['sem pessoa', { userId: undefined }],
    [
      'pessoa e visitante juntos',
      { visitor: { name: 'X Y', email: 'x@y.com', password: PASSWORD } },
    ],
    ['término antes do início', { startDate: day(5), endDate: day(4) }],
    ['data em formato errado', { startDate: '10/11/2026' }],
    ['horário em formato errado', { startTime: '8h' }],
    ['horário final antes do inicial', { startTime: '18:00', endTime: '08:00' }],
    ['horário final igual ao inicial', { startTime: '08:00', endTime: '08:00' }],
    ['limite de usos zero', { maxUses: 0 }],
    ['campo desconhecido', { foo: 'bar' }],
  ])('recusa com 400: %s', async (_name, overrides) => {
    const res = await post(forResident(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recusa período que já terminou', async () => {
    const res = await post(forResident({ startDate: day(-5), endDate: day(-1) }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('END_DATE_IN_PAST');
  });

  it('recusa pessoa inexistente ou desativada', async () => {
    const missing = await post(forResident({ userId: randomUUID() }));
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');

    await db.user.update({ where: { id: resident.id }, data: { active: false } });
    const inactive = await post(forResident());
    expect(inactive.status).toBe(422);
    expect(inactive.body.error.code).toBe('USER_INACTIVE');
  });

  it('recusa local inexistente ou desativado', async () => {
    const missing = await post(forResident({ locationId: randomUUID() }));
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('LOCATION_NOT_FOUND');

    await db.location.update({ where: { id: turnstileId }, data: { active: false } });
    const inactive = await post(forResident({ locationId: turnstileId }));
    expect(inactive.status).toBe(422);
    expect(inactive.body.error.code).toBe('LOCATION_INACTIVE');
  });

  it('só administrador cria', async () => {
    const session = await login(app, resident.email);
    const res = await post(forResident(), `Bearer ${session.accessToken}`);
    expect(res.status).toBe(403);

    const anonymous = await request(app).post('/api/v1/authorizations').send(forResident());
    expect(anonymous.status).toBe(401);
  });
});

describe('GET /authorizations', () => {
  it('lista com paginação, da mais recente para a mais antiga', async () => {
    await insert({ startDate: day(-2) });
    await insert({ startDate: day(0) });
    await insert({ startDate: day(-1) });

    const res = await list({ pageSize: '2' });

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(res.body.data.map((a: { startDate: string }) => a.startDate)).toEqual([day(0), day(-1)]);
  });

  it('filtra por pessoa e por local', async () => {
    const other = await createUser(ctx, { role: Role.RESIDENT });
    const mine = await insert({ locationId: turnstileId });
    await insert({ userId: other.id });

    const byUser = await list({ userId: resident.id, locationId: turnstileId });
    expect(byUser.body.data.map((a: { id: string }) => a.id)).toEqual([mine.id]);
  });

  it('filtra por período: traz as que têm algum dia dentro do intervalo', async () => {
    const before = await insert({ startDate: day(-10), endDate: day(-6) });
    const overlapsStart = await insert({ startDate: day(-6), endDate: day(-4) });
    const inside = await insert({ startDate: day(-3), endDate: day(-2) });
    const overlapsEnd = await insert({ startDate: day(-1), endDate: day(3) });
    const after = await insert({ startDate: day(4), endDate: day(8) });

    const res = await list({ from: day(-5), to: day(0) });

    const ids = res.body.data.map((a: { id: string }) => a.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining([overlapsStart.id, inside.id, overlapsEnd.id]));
    expect(ids).not.toContain(before.id);
    expect(ids).not.toContain(after.id);
  });

  it('filtra pela situação', async () => {
    const valid = await insert();
    const validWithUsesLeft = await insert({ maxUses: 2, usesCount: 1 });
    const scheduled = await insert({ startDate: day(1), endDate: day(2) });
    const expired = await insert({ startDate: day(-5), endDate: day(-1) });
    const exhausted = await insert({ maxUses: 1, usesCount: 1 });
    const cancelled = await insert({ status: AuthorizationStatus.CANCELLED });

    const expected = {
      VALID: [valid.id, validWithUsesLeft.id],
      SCHEDULED: [scheduled.id],
      EXPIRED: [expired.id],
      EXHAUSTED: [exhausted.id],
      CANCELLED: [cancelled.id],
    };
    for (const [situation, ids] of Object.entries(expected)) {
      const res = await list({ situation });
      expect(res.status).toBe(200);
      const found = res.body.data.map((a: { id: string; situation: string }) => {
        expect(a.situation).toBe(situation);
        return a.id;
      });
      expect(found.sort()).toEqual([...ids].sort());
    }
  });

  it('recusa filtro inválido', async () => {
    expect((await list({ situation: 'FOO' })).status).toBe(400);
    expect((await list({ from: day(2), to: day(1) })).status).toBe(400);
  });

  it('só administrador lista', async () => {
    const session = await login(app, resident.email);
    expect((await list({}, `Bearer ${session.accessToken}`)).status).toBe(403);
  });
});

describe('GET /authorizations/:id', () => {
  it('busca uma autorização; id inexistente dá 404', async () => {
    const created = await insert();
    const found = await request(app)
      .get(`/api/v1/authorizations/${created.id}`)
      .set('Authorization', admin.auth);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(created.id);

    const missing = await request(app)
      .get(`/api/v1/authorizations/${randomUUID()}`)
      .set('Authorization', admin.auth);
    expect(missing.status).toBe(404);
  });
});

describe('POST /authorizations/:id/cancel', () => {
  const cancel = (id: string, body?: object) => {
    const req = request(app)
      .post(`/api/v1/authorizations/${id}/cancel`)
      .set('Authorization', admin.auth);
    return body ? req.send(body) : req;
  };

  it('cancela registrando quem, quando e por quê', async () => {
    const created = await insert();

    const res = await cancel(created.id, { reason: 'Mudou de apartamento' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'CANCELLED',
      situation: 'CANCELLED',
      cancelledById: admin.id,
      cancelReason: 'Mudou de apartamento',
    });
    expect(res.body.cancelledAt).toEqual(expect.any(String));
  });

  it('o motivo é opcional', async () => {
    const created = await insert();
    const res = await cancel(created.id);
    expect(res.status).toBe(200);
    expect(res.body.cancelReason).toBeNull();
  });

  it('não cancela duas vezes', async () => {
    const created = await insert();
    await cancel(created.id);
    const again = await cancel(created.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CANCELLED');
  });

  it('id inexistente dá 404', async () => {
    expect((await cancel(randomUUID())).status).toBe(404);
  });

  it('só administrador cancela', async () => {
    const created = await insert();
    const session = await login(app, resident.email);
    const res = await request(app)
      .post(`/api/v1/authorizations/${created.id}/cancel`)
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /me/authorizations', () => {
  it('condômino vê só as próprias autorizações, com local e situação', async () => {
    const other = await createUser(ctx, { role: Role.RESIDENT });
    const mine = await insert({ locationId: turnstileId });
    await insert({ userId: other.id });

    const session = await login(app, resident.email);
    const res = await request(app)
      .get('/api/v1/me/authorizations')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      id: mine.id,
      location: { name: 'Catraca 1' },
      situation: 'VALID',
    });
  });

  it('filtra pela situação', async () => {
    await insert();
    const expired = await insert({ startDate: day(-3), endDate: day(-1) });

    const session = await login(app, resident.email);
    const res = await request(app)
      .get('/api/v1/me/authorizations')
      .query({ situation: 'EXPIRED' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([expired.id]);
  });

  it('exige login', async () => {
    expect((await request(app).get('/api/v1/me/authorizations')).status).toBe(401);
  });
});
