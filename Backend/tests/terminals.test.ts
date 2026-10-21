import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LocationType, Role } from '../src/generated/prisma/enums.js';
import { createTestContext, resetDatabase, sessionFor } from './helpers.js';

const ctx = createTestContext();
const { app, container } = ctx;
const db = container.prisma;

let auth: string;
let turnstileId: string;
let doorId: string;

beforeEach(async () => {
  await resetDatabase(db);
  ({ auth } = await sessionFor(ctx, Role.ADMIN));
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
  const turnstile = await db.location.create({
    data: {
      type: LocationType.TURNSTILE,
      name: 'Catraca 1',
      parentId: door.id,
      latitude: -23.30501,
      longitude: -45.96581,
    },
  });
  doorId = door.id;
  turnstileId = turnstile.id;
});
afterAll(() => db.$disconnect());

const createTerminal = (locationId = turnstileId) =>
  request(app)
    .post('/api/v1/terminals')
    .set('Authorization', auth)
    .send({ name: 'Terminal Catraca 1', locationId });

const asTerminal = (credential: string) =>
  request(app).get('/api/v1/terminals/me').set('Authorization', `Terminal ${credential}`);

describe('POST /terminals', () => {
  it('cadastra numa catraca e devolve a credencial uma única vez', async () => {
    const res = await createTerminal();

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.terminal).toMatchObject({
      name: 'Terminal Catraca 1',
      locationId: turnstileId,
      active: true,
      lastSeenAt: null,
    });
    expect(res.body.credential).toMatch(new RegExp(`^${res.body.terminal.id}\\.[\\w-]{43}$`));

    const fetched = await request(app)
      .get(`/api/v1/terminals/${res.body.terminal.id}`)
      .set('Authorization', auth);
    expect(fetched.body).not.toHaveProperty('credential');
    expect(fetched.body).not.toHaveProperty('secretHash');

    const stored = await db.terminal.findUniqueOrThrow({ where: { id: res.body.terminal.id } });
    expect(res.body.credential).not.toContain(stored.secretHash);
  });

  it('só aceita catraca existente e ativa, uma por terminal', async () => {
    const notTurnstile = await createTerminal(doorId);
    expect(notTurnstile.status).toBe(422);
    expect(notTurnstile.body.error.code).toBe('NOT_A_TURNSTILE');

    const missing = await createTerminal(randomUUID());
    expect(missing.body.error.code).toBe('LOCATION_NOT_FOUND');

    await createTerminal().expect(201);
    const duplicate = await createTerminal();
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('TURNSTILE_HAS_TERMINAL');
  });

  it('só administrador cadastra', async () => {
    const visitor = await sessionFor(ctx, Role.VISITOR);
    const res = await request(app)
      .post('/api/v1/terminals')
      .set('Authorization', visitor.auth)
      .send({ name: 'Terminal', locationId: turnstileId });
    expect(res.status).toBe(403);
  });
});

describe('GET /terminals/me (credencial do dispositivo)', () => {
  it('autentica o terminal, diz onde ele está e registra a última conexão', async () => {
    const { body } = await createTerminal();

    const res = await asTerminal(body.credential);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: body.terminal.id,
      name: 'Terminal Catraca 1',
      location: { id: turnstileId, name: 'Catraca 1', latitude: -23.30501, longitude: -45.96581 },
    });
    const stored = await db.terminal.findUniqueOrThrow({ where: { id: body.terminal.id } });
    expect(stored.lastSeenAt).toBeInstanceOf(Date);
  });

  it.each([
    ['segredo errado', (c: string) => `${c.split('.')[0]}.${'x'.repeat(43)}`],
    ['terminal inexistente', (c: string) => `${randomUUID()}.${c.split('.')[1]}`],
    ['formato sem ponto', () => 'semponto'],
    ['id malformado', (c: string) => `123.${c.split('.')[1]}`],
  ])('recusa %s com 401', async (_case, tamper) => {
    const { body } = await createTerminal();
    const res = await asTerminal(tamper(body.credential as string));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TERMINAL_CREDENTIAL');
  });

  it('JWT de usuário não serve como credencial de terminal', async () => {
    const res = await request(app).get('/api/v1/terminals/me').set('Authorization', auth);
    expect(res.status).toBe(401);
  });

  it('terminal desativado perde o acesso; reativado volta', async () => {
    const { body } = await createTerminal();
    const id = body.terminal.id as string;

    await request(app).delete(`/api/v1/terminals/${id}`).set('Authorization', auth).expect(204);
    expect((await asTerminal(body.credential)).status).toBe(401);

    await request(app)
      .patch(`/api/v1/terminals/${id}`)
      .set('Authorization', auth)
      .send({ active: true })
      .expect(200);
    expect((await asTerminal(body.credential)).status).toBe(200);
  });

  it('nova credencial invalida a anterior na hora', async () => {
    const { body } = await createTerminal();

    const rotated = await request(app)
      .post(`/api/v1/terminals/${body.terminal.id}/credential`)
      .set('Authorization', auth);
    expect(rotated.status).toBe(200);
    expect(rotated.body.credential).not.toBe(body.credential);

    expect((await asTerminal(body.credential)).status).toBe(401);
    expect((await asTerminal(rotated.body.credential)).status).toBe(200);
  });
});

describe('gestão de terminais', () => {
  it('lista, renomeia e filtra por situação', async () => {
    const { body } = await createTerminal();
    await request(app)
      .patch(`/api/v1/terminals/${body.terminal.id}`)
      .set('Authorization', auth)
      .send({ name: 'Terminal Norte' })
      .expect(200);

    const list = await request(app).get('/api/v1/terminals?active=true').set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].name).toBe('Terminal Norte');
  });

  it('não reativa terminal se a catraca foi desativada', async () => {
    const { body } = await createTerminal();
    const id = body.terminal.id as string;
    await request(app).delete(`/api/v1/terminals/${id}`).set('Authorization', auth).expect(204);
    await request(app)
      .delete(`/api/v1/locations/${turnstileId}`)
      .set('Authorization', auth)
      .expect(204);

    const res = await request(app)
      .patch(`/api/v1/terminals/${id}`)
      .set('Authorization', auth)
      .send({ active: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LOCATION_INACTIVE');
  });

  it('terminal inexistente responde 404', async () => {
    const res = await request(app)
      .post(`/api/v1/terminals/${randomUUID()}/credential`)
      .set('Authorization', auth);
    expect(res.status).toBe(404);
  });
});
