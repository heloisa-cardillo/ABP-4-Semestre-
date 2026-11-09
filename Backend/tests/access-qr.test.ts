import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AccessResult, DenyReason, LocationType, Role } from '../src/generated/prisma/enums.js';
import type {
  AccessAttempt,
  AccessDecider,
  AccessDecision,
} from '../src/services/access-decision.js';
import { sha256 } from '../src/services/token.service.js';
import { createTestContext, resetDatabase, sessionFor } from './helpers.js';

/** Dublê do serviço de decisão do Dev 2: guarda as tentativas e libera quando não há negação prévia. */
class FakeDecider implements AccessDecider {
  attempts: AccessAttempt[] = [];

  decide(attempt: AccessAttempt): Promise<AccessDecision> {
    this.attempts.push(attempt);
    const denied = attempt.presetDeny !== undefined;
    return Promise.resolve({
      result: denied ? AccessResult.DENIED : AccessResult.GRANTED,
      denyReason: attempt.presetDeny ?? null,
      message: denied ? 'Acesso negado' : 'Acesso liberado',
      eventId: '019a0000-0000-7000-8000-00000000e001',
      authorizationId: null,
      user: attempt.userId ? { id: attempt.userId, name: 'Ana' } : null,
      distanceMeters: 12.5,
    });
  }
}

const decider = new FakeDecider();
const ctx = createTestContext({}, { accessDecider: decider });
const { app, container } = ctx;
const db = container.prisma;

let terminalAuth: string;
let terminalId: string;
let userAuth: string;
let userId: string;

const position = { latitude: -23.30501, longitude: -45.96581 };

beforeEach(async () => {
  await resetDatabase(db);
  decider.attempts = [];

  const admin = await sessionFor(ctx, Role.ADMIN);
  const resident = await sessionFor(ctx, Role.RESIDENT);
  userAuth = resident.auth;
  userId = resident.user.id;

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
    data: { type: LocationType.TURNSTILE, name: 'Catraca 1', parentId: door.id, ...position },
  });
  const created = await request(app)
    .post('/api/v1/terminals')
    .set('Authorization', admin.auth)
    .send({ name: 'Terminal 1', locationId: turnstile.id });
  terminalId = created.body.terminal.id;
  terminalAuth = `Terminal ${created.body.credential}`;
});
afterAll(() => db.$disconnect());

const issue = (auth = terminalAuth) =>
  request(app).post('/api/v1/access/qr/challenge').set('Authorization', auth);

const redeem = (body: object, auth = userAuth) =>
  request(app).post('/api/v1/access/qr').set('Authorization', auth).send(body);

async function newCode(): Promise<{ code: string; id: string }> {
  const res = await issue();
  return { code: res.body.code, id: res.body.code.split('.')[0] };
}

describe('POST /access/qr/challenge (terminal)', () => {
  it('gera um código de uso único que vale 10 segundos', async () => {
    const before = Date.now();
    const res = await issue();

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.ttlSeconds).toBe(10);
    expect(res.body.code).toMatch(/^[0-9a-f-]{36}\.[\w-]{43}$/);
    const expiresAt = new Date(res.body.expiresAt).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(9_000);
    expect(expiresAt - before).toBeLessThanOrEqual(11_000);
  });

  it('o banco guarda só o hash do segredo', async () => {
    const { code, id } = await newCode();
    const stored = await db.qrChallenge.findUniqueOrThrow({ where: { id } });
    expect(stored.terminalId).toBe(terminalId);
    expect(stored.secretHash).toBe(sha256(code.split('.')[1] as string));
    expect(JSON.stringify(stored)).not.toContain(code.split('.')[1]);
  });

  it('cada chamada gera um código diferente', async () => {
    const a = await newCode();
    const b = await newCode();
    expect(a.code).not.toBe(b.code);
  });

  it('apaga os códigos vencidos há mais de uma hora do mesmo terminal', async () => {
    const old = await db.qrChallenge.create({
      data: {
        terminalId,
        secretHash: '0'.repeat(64),
        expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });

    await issue();

    expect(await db.qrChallenge.findUnique({ where: { id: old.id } })).toBeNull();
  });

  it('só o terminal pede código: sem credencial ou com JWT de usuário dá 401', async () => {
    expect((await request(app).post('/api/v1/access/qr/challenge')).status).toBe(401);
    expect((await issue(userAuth)).status).toBe(401);
  });
});

describe('POST /access/qr (app)', () => {
  it('código válido: repassa a tentativa para o serviço de decisão e devolve a decisão', async () => {
    const { code, id } = await newCode();

    const res = await redeem({ code, ...position });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: 'GRANTED',
      denyReason: null,
      message: 'Acesso liberado',
      eventId: '019a0000-0000-7000-8000-00000000e001',
      distanceMeters: 12.5,
    });
    expect(decider.attempts).toEqual([
      { method: 'QR', terminalId, userId, credential: id, position },
    ]);
    const stored = await db.qrChallenge.findUniqueOrThrow({ where: { id } });
    expect(stored.usedAt).not.toBeNull();
  });

  it('código já usado: CREDENTIAL_ALREADY_USED', async () => {
    const { code } = await newCode();
    await redeem({ code, ...position });

    const again = await redeem({ code, ...position });

    expect(again.status).toBe(200);
    expect(again.body.result).toBe('DENIED');
    expect(decider.attempts[1]).toMatchObject({
      terminalId,
      userId,
      presetDeny: DenyReason.CREDENTIAL_ALREADY_USED,
    });
  });

  it('código vencido: EXPIRED_CREDENTIAL', async () => {
    const { code, id } = await newCode();
    await db.qrChallenge.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await redeem({ code, ...position });

    expect(res.body.denyReason).toBe('EXPIRED_CREDENTIAL');
    expect(decider.attempts[0]).toMatchObject({
      terminalId,
      presetDeny: DenyReason.EXPIRED_CREDENTIAL,
    });
  });

  it('segredo errado: INVALID_CREDENTIAL, sem atribuir a tentativa ao terminal', async () => {
    const { id } = await newCode();

    const res = await redeem({ code: `${id}.${'x'.repeat(43)}`, ...position });

    expect(res.body.denyReason).toBe('INVALID_CREDENTIAL');
    expect(decider.attempts[0]).toMatchObject({
      terminalId: null,
      userId,
      credential: id,
      presetDeny: DenyReason.INVALID_CREDENTIAL,
    });
    // O código verdadeiro continua valendo: errar o segredo não queima o código de outra pessoa.
    const stored = await db.qrChallenge.findUniqueOrThrow({ where: { id } });
    expect(stored.usedAt).toBeNull();
  });

  it('código inexistente: INVALID_CREDENTIAL', async () => {
    const res = await redeem({
      code: `019a0000-0000-7000-8000-000000000999.${'a'.repeat(43)}`,
      ...position,
    });
    expect(res.body.denyReason).toBe('INVALID_CREDENTIAL');
    expect(decider.attempts[0]?.terminalId).toBeNull();
  });

  it('duas leituras ao mesmo tempo: só uma passa', async () => {
    const { code } = await newCode();

    const results = await Promise.all([
      redeem({ code, ...position }),
      redeem({ code, ...position }),
      redeem({ code, ...position }),
    ]);

    const granted = results.filter((r) => r.body.result === 'GRANTED');
    expect(granted).toHaveLength(1);
  });

  it.each([
    ['QR que não é do sistema', { code: 'https://exemplo.com', ...position }],
    ['sem posição', { code: `019a0000-0000-7000-8000-000000000999.${'a'.repeat(43)}` }],
    [
      'latitude fora da faixa',
      {
        code: `019a0000-0000-7000-8000-000000000999.${'a'.repeat(43)}`,
        latitude: 91,
        longitude: 0,
      },
    ],
  ])('recusa com 400: %s', async (_name, body) => {
    const res = await redeem(body);
    expect(res.status).toBe(400);
    expect(decider.attempts).toHaveLength(0);
  });

  it('exige login no app', async () => {
    const { code } = await newCode();
    const res = await request(app)
      .post('/api/v1/access/qr')
      .send({ code, ...position });
    expect(res.status).toBe(401);
  });
});

describe('com o serviço de decisão de verdade (sem dublê)', () => {
  it('aplica as regras: sem autorização, nega com NO_AUTHORIZATION e grava o evento', async () => {
    const real = createTestContext();
    const { code } = await newCode();

    const res = await request(real.app)
      .post('/api/v1/access/qr')
      .set('Authorization', userAuth)
      .send({ code, ...position });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: 'DENIED', denyReason: 'NO_AUTHORIZATION' });
    expect(await db.accessEvent.count()).toBe(1);
    await real.container.prisma.$disconnect();
  });
});
