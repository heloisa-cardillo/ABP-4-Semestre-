import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma, User } from '../src/generated/prisma/client.js';
import {
  AccessMethod,
  AccessResult,
  DenyReason,
  LocationType,
  Role,
} from '../src/generated/prisma/enums.js';
import { localDayStart } from '../src/services/local-time.js';
import {
  createTestContext,
  createUser,
  login,
  PASSWORD,
  resetDatabase,
  sessionFor,
} from './helpers.js';

const ctx = createTestContext();
const { app, container } = ctx;
const db = container.prisma;
const TZ = container.env.BUILDING_TIMEZONE;

let adminAuth: string;
let ana: User;
let bruno: User;
let buildingId: string;
let turnstile1Id: string;
let turnstile2Id: string;
let terminal1Id: string;

beforeEach(async () => {
  await resetDatabase(db);
  adminAuth = (await sessionFor(ctx, Role.ADMIN)).auth;
  ana = await createUser(ctx, { name: 'Ana Condômina', role: Role.RESIDENT });
  bruno = await createUser(ctx, { name: 'Bruno Visitante', role: Role.VISITOR });

  const building = await db.location.create({
    data: { type: LocationType.BUILDING, name: 'Edifício', latitude: -23.305, longitude: -45.965 },
  });
  const gatehouse = await db.location.create({
    data: { type: LocationType.GATEHOUSE, name: 'Portaria', parentId: building.id },
  });
  const door = await db.location.create({
    data: { type: LocationType.DOOR, name: 'Porta', parentId: gatehouse.id },
  });
  const turnstile1 = await db.location.create({
    data: { type: LocationType.TURNSTILE, name: 'Catraca 1', parentId: door.id },
  });
  const turnstile2 = await db.location.create({
    data: { type: LocationType.TURNSTILE, name: 'Catraca 2', parentId: door.id },
  });
  const terminal1 = await db.terminal.create({
    data: { name: 'Terminal 1', locationId: turnstile1.id, secretHash: 'a'.repeat(64) },
  });
  buildingId = building.id;
  turnstile1Id = turnstile1.id;
  turnstile2Id = turnstile2.id;
  terminal1Id = terminal1.id;
});
afterAll(() => db.$disconnect());

/** Instante a `hours` horas da meia-noite local do dia informado. */
const at = (date: string, hours: number) =>
  new Date(localDayStart(date, TZ).getTime() + hours * 3_600_000);

function event(data: Partial<Prisma.AccessEventUncheckedCreateInput>) {
  return db.accessEvent.create({
    data: {
      method: AccessMethod.QR,
      result: AccessResult.GRANTED,
      locationId: turnstile1Id,
      terminalId: terminal1Id,
      ...data,
    },
  });
}

const history = (query: Record<string, string> = {}, auth = adminAuth) =>
  request(app).get('/api/v1/access-events').query(query).set('Authorization', auth);

const mine = (auth: string, query: Record<string, string> = {}) =>
  request(app).get('/api/v1/me/access-events').query(query).set('Authorization', auth);

const ids = (res: request.Response) => (res.body.data as { id: string }[]).map((e) => e.id);

describe('GET /access-events (administrador)', () => {
  it('lista todas as tentativas, da mais recente para a mais antiga, com os dados relacionados', async () => {
    const old = await event({ userId: ana.id, occurredAt: at('2026-11-01', 10) });
    const denied = await event({
      method: AccessMethod.NFC,
      result: AccessResult.DENIED,
      denyReason: DenyReason.UNKNOWN_USER,
      credential: '04:A2:3B:1C',
      occurredAt: at('2026-11-02', 10),
    });

    const res = await history();

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    expect(ids(res)).toEqual([denied.id, old.id]);
    expect(res.body.data[0]).toMatchObject({
      method: 'NFC',
      result: 'DENIED',
      denyReason: 'UNKNOWN_USER',
      user: null,
      credential: '04:A2:3B:1C',
      location: { id: turnstile1Id, name: 'Catraca 1', type: 'TURNSTILE' },
      terminal: { id: terminal1Id, name: 'Terminal 1' },
      occurredAt: at('2026-11-02', 10).toISOString(),
    });
    expect(res.body.data[1]).toMatchObject({
      result: 'GRANTED',
      denyReason: null,
      user: { id: ana.id, name: 'Ana Condômina', role: 'RESIDENT' },
    });
  });

  it('filtra por pessoa, método e resultado', async () => {
    const target = await event({
      userId: ana.id,
      method: AccessMethod.NFC,
      result: AccessResult.DENIED,
      denyReason: DenyReason.OUTSIDE_TIME_WINDOW,
    });
    await event({ userId: ana.id, method: AccessMethod.NFC, result: AccessResult.GRANTED });
    await event({ userId: ana.id, method: AccessMethod.QR, result: AccessResult.DENIED });
    await event({ userId: bruno.id, method: AccessMethod.NFC, result: AccessResult.DENIED });

    const res = await history({ userId: ana.id, method: 'NFC', result: 'DENIED' });

    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([target.id]);
  });

  it('filtro por local inclui tudo abaixo dele na hierarquia', async () => {
    const t1 = await event({ locationId: turnstile1Id, occurredAt: at('2026-11-01', 9) });
    const t2 = await event({
      locationId: turnstile2Id,
      terminalId: null,
      occurredAt: at('2026-11-01', 10),
    });

    const byBuilding = await history({ locationId: buildingId });
    expect(ids(byBuilding)).toEqual([t2.id, t1.id]);

    const byTurnstile = await history({ locationId: turnstile2Id });
    expect(ids(byTurnstile)).toEqual([t2.id]);
  });

  it('filtra por terminal', async () => {
    const withTerminal = await event({});
    await event({ terminalId: null });

    const res = await history({ terminalId: terminal1Id });
    expect(ids(res)).toEqual([withTerminal.id]);
  });

  it('período (from/to) usa o dia inteiro no fuso do edifício, nas duas pontas', async () => {
    await event({ occurredAt: new Date(localDayStart('2026-11-10', TZ).getTime() - 1) });
    const first = await event({ occurredAt: localDayStart('2026-11-10', TZ) });
    const last = await event({
      occurredAt: new Date(localDayStart('2026-11-12', TZ).getTime() - 1),
    });
    await event({ occurredAt: localDayStart('2026-11-12', TZ) });

    const res = await history({ from: '2026-11-10', to: '2026-11-11' });
    expect(ids(res)).toEqual([last.id, first.id]);

    const onlyFrom = await history({ from: '2026-11-11' });
    expect(onlyFrom.body.meta.total).toBe(2);

    const onlyTo = await history({ to: '2026-11-10' });
    expect(onlyTo.body.meta.total).toBe(2);
  });

  it('pagina o resultado', async () => {
    for (let hour = 1; hour <= 5; hour += 1) await event({ occurredAt: at('2026-11-01', hour) });

    const res = await history({ page: '2', pageSize: '2' });
    expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 5 });
    expect(res.body.data.map((e: { occurredAt: string }) => e.occurredAt)).toEqual([
      at('2026-11-01', 3).toISOString(),
      at('2026-11-01', 2).toISOString(),
    ]);
  });

  it('recusa filtro inválido', async () => {
    expect((await history({ from: '2026-11-12', to: '2026-11-10' })).status).toBe(400);
    expect((await history({ method: 'FACE' })).status).toBe(400);
    expect((await history({ userId: 'nao-e-uuid' })).status).toBe(400);
    expect((await history({ pageSize: '500' })).status).toBe(400);
  });

  it('exige administrador', async () => {
    expect((await request(app).get('/api/v1/access-events')).status).toBe(401);
    const resident = await login(app, ana.email, PASSWORD);
    expect((await history({}, `Bearer ${resident.accessToken}`)).status).toBe(403);
  });
});

describe('GET /me/access-events (pessoa logada)', () => {
  it('mostra só as tentativas da própria pessoa, com os mesmos filtros', async () => {
    const granted = await event({ userId: ana.id, occurredAt: at('2026-11-01', 8) });
    const denied = await event({
      userId: ana.id,
      result: AccessResult.DENIED,
      denyReason: DenyReason.OUT_OF_RANGE,
      distanceMeters: 250.4,
      occurredAt: at('2026-11-02', 8),
    });
    await event({ userId: bruno.id });
    await event({});

    const session = await login(app, ana.email, PASSWORD);
    const auth = `Bearer ${session.accessToken}`;

    const all = await mine(auth);
    expect(all.status).toBe(200);
    expect(ids(all)).toEqual([denied.id, granted.id]);
    expect(all.body.data[0]).toMatchObject({ denyReason: 'OUT_OF_RANGE', distanceMeters: 250.4 });

    const onlyDenied = await mine(auth, { result: 'DENIED' });
    expect(ids(onlyDenied)).toEqual([denied.id]);

    const firstDay = await mine(auth, { from: '2026-11-01', to: '2026-11-01' });
    expect(ids(firstDay)).toEqual([granted.id]);
  });

  it('não aceita filtrar por outra pessoa', async () => {
    const session = await login(app, bruno.email, PASSWORD);
    const res = await mine(`Bearer ${session.accessToken}`, { userId: ana.id });
    expect(res.status).toBe(400);
  });

  it('exige login', async () => {
    expect((await request(app).get('/api/v1/me/access-events')).status).toBe(401);
  });
});
