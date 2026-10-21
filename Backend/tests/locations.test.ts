import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
import { createTestContext, resetDatabase, sessionFor } from './helpers.js';

const ctx = createTestContext();
const { app, container } = ctx;

let auth: string;

beforeEach(async () => {
  await resetDatabase(container.prisma);
  ({ auth } = await sessionFor(ctx, Role.ADMIN));
});
afterAll(() => container.prisma.$disconnect());

const post = (body: object) =>
  request(app).post('/api/v1/locations').set('Authorization', auth).send(body);

const building = {
  type: 'BUILDING',
  name: 'Edifício Central',
  address: 'Rua Exemplo, 100 - Jacareí/SP',
  latitude: -23.305,
  longitude: -45.9658,
};

/** Cria a árvore completa e devolve os ids de cada nível. */
async function createTree() {
  const b = await post(building);
  const g = await post({ type: 'GATEHOUSE', name: 'Portaria Principal', parentId: b.body.id });
  const d = await post({ type: 'DOOR', name: 'Porta do Elevador Social', parentId: g.body.id });
  const t = await post({
    type: 'TURNSTILE',
    name: 'Catraca 1',
    parentId: d.body.id,
    latitude: -23.30501,
    longitude: -45.96581,
  });
  return {
    buildingId: b.body.id as string,
    gatehouseId: g.body.id as string,
    doorId: d.body.id as string,
    turnstileId: t.body.id as string,
  };
}

describe('POST /locations', () => {
  it('monta a hierarquia Edifício › Portaria › Porta › Catraca', async () => {
    const tree = await createTree();

    const turnstile = await request(app)
      .get(`/api/v1/locations/${tree.turnstileId}`)
      .set('Authorization', auth);
    expect(turnstile.status).toBe(200);
    expect(turnstile.body).toMatchObject({
      type: 'TURNSTILE',
      parentId: tree.doorId,
      latitude: -23.30501,
      longitude: -45.96581,
      active: true,
    });
  });

  it.each([
    ['portaria sem edifício', { type: 'GATEHOUSE', name: 'Portaria' }],
    ['edifício dentro de outro local', { ...building, parentId: randomUUID() }],
  ])('recusa %s (INVALID_HIERARCHY)', async (_case, body) => {
    const res = await post(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_HIERARCHY');
  });

  it('recusa pular nível: catraca direto no edifício', async () => {
    const b = await post(building);
    const res = await post({
      type: 'TURNSTILE',
      name: 'Catraca',
      parentId: b.body.id,
      latitude: -23.3,
      longitude: -45.9,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_HIERARCHY');
    expect(res.body.error.message).toContain('Porta');
  });

  it('recusa local de cima inexistente ou desativado', async () => {
    const missing = await post({ type: 'GATEHOUSE', name: 'Portaria', parentId: randomUUID() });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('PARENT_NOT_FOUND');

    const b = await post(building);
    await request(app).delete(`/api/v1/locations/${b.body.id}`).set('Authorization', auth);
    const inactive = await post({ type: 'GATEHOUSE', name: 'Portaria', parentId: b.body.id });
    expect(inactive.status).toBe(422);
    expect(inactive.body.error.code).toBe('PARENT_INACTIVE');
  });

  it('edifício exige endereço e coordenadas; catraca exige coordenadas', async () => {
    const noAddress = await post({ ...building, address: undefined });
    expect(noAddress.body.error.code).toBe('ADDRESS_REQUIRED');

    const noCoords = await post({ ...building, latitude: undefined, longitude: undefined });
    expect(noCoords.body.error.code).toBe('COORDINATES_REQUIRED');

    const { doorId } = await createTree();
    const turnstile = await post({ type: 'TURNSTILE', name: 'Catraca 2', parentId: doorId });
    expect(turnstile.status).toBe(422);
    expect(turnstile.body.error.code).toBe('COORDINATES_REQUIRED');
  });

  it.each([
    ['latitude sem longitude', { latitude: -23.3, longitude: undefined }],
    ['latitude fora da faixa', { latitude: -91 }],
    ['longitude fora da faixa', { longitude: 181 }],
    ['tipo inexistente', { type: 'ANDAR' }],
  ])('recusa %s com 400', async (_case, override) => {
    const res = await post({ ...building, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('só administrador cadastra', async () => {
    const resident = await sessionFor(ctx, Role.RESIDENT);
    const res = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', resident.auth)
      .send(building);
    expect(res.status).toBe(403);
  });
});

describe('GET /locations', () => {
  it('filtra por tipo, por local de cima e por nome', async () => {
    const tree = await createTree();
    await post({ type: 'GATEHOUSE', name: 'Portaria de Serviço', parentId: tree.buildingId });

    const gatehouses = await request(app)
      .get(`/api/v1/locations?type=GATEHOUSE&parentId=${tree.buildingId}`)
      .set('Authorization', auth);
    expect(gatehouses.status).toBe(200);
    expect(gatehouses.body.meta.total).toBe(2);
    expect(gatehouses.body.data.map((l: { name: string }) => l.name)).toEqual([
      'Portaria de Serviço',
      'Portaria Principal',
    ]);

    const search = await request(app)
      .get('/api/v1/locations?search=catraca')
      .set('Authorization', auth);
    expect(search.body.data).toHaveLength(1);
  });

  it('id inexistente responde 404', async () => {
    const res = await request(app)
      .get(`/api/v1/locations/${randomUUID()}`)
      .set('Authorization', auth);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /locations/:id', () => {
  it('altera nome e coordenadas', async () => {
    const { turnstileId } = await createTree();
    const res = await request(app)
      .patch(`/api/v1/locations/${turnstileId}`)
      .set('Authorization', auth)
      .send({ name: 'Catraca Norte', latitude: -23.31, longitude: -45.97 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Catraca Norte', latitude: -23.31, longitude: -45.97 });
  });

  it('não deixa catraca ficar sem coordenadas nem edifício sem endereço', async () => {
    const { turnstileId, buildingId } = await createTree();
    const coords = await request(app)
      .patch(`/api/v1/locations/${turnstileId}`)
      .set('Authorization', auth)
      .send({ latitude: null, longitude: null });
    expect(coords.status).toBe(422);
    expect(coords.body.error.code).toBe('COORDINATES_REQUIRED');

    const address = await request(app)
      .patch(`/api/v1/locations/${buildingId}`)
      .set('Authorization', auth)
      .send({ address: null });
    expect(address.status).toBe(422);
    expect(address.body.error.code).toBe('ADDRESS_REQUIRED');
  });

  it.each([
    ['latitude nula com longitude preenchida', { latitude: null, longitude: -45.9 }],
    ['latitude preenchida com longitude nula', { latitude: -23.3, longitude: null }],
  ])('recusa %s com 400, mesmo em nível sem coordenada obrigatória', async (_case, body) => {
    const { doorId } = await createTree();
    const res = await request(app)
      .patch(`/api/v1/locations/${doorId}`)
      .set('Authorization', auth)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('não aceita mudar tipo nem local de cima', async () => {
    const { doorId, gatehouseId } = await createTree();
    const res = await request(app)
      .patch(`/api/v1/locations/${doorId}`)
      .set('Authorization', auth)
      .send({ type: 'TURNSTILE', parentId: gatehouseId });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /locations/:id', () => {
  it('desativa de baixo para cima; com filhos ativos responde 409', async () => {
    const tree = await createTree();

    const blocked = await request(app)
      .delete(`/api/v1/locations/${tree.doorId}`)
      .set('Authorization', auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('HAS_ACTIVE_CHILDREN');

    for (const id of [tree.turnstileId, tree.doorId]) {
      const res = await request(app).delete(`/api/v1/locations/${id}`).set('Authorization', auth);
      expect(res.status).toBe(204);
    }
    const door = await container.prisma.location.findUniqueOrThrow({ where: { id: tree.doorId } });
    expect(door.active).toBe(false);
  });

  it('catraca com terminal ativo não é desativada', async () => {
    const { turnstileId } = await createTree();
    await request(app)
      .post('/api/v1/terminals')
      .set('Authorization', auth)
      .send({ name: 'Terminal 1', locationId: turnstileId })
      .expect(201);

    const res = await request(app)
      .delete(`/api/v1/locations/${turnstileId}`)
      .set('Authorization', auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_ACTIVE_TERMINAL');
  });
});
