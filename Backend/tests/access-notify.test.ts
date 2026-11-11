import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connect } from 'mqtt';
import pino from 'pino';
import type { User } from '../src/generated/prisma/client.js';
import { LocationType, Role } from '../src/generated/prisma/enums.js';
import { MqttTurnstileNotifier } from '../src/adapters/mqtt-turnstile-notifier.js';
import type { AccessDecision } from '../src/services/access-decision.js';
import { addDays, dateToDb, localDate, timeToDb } from '../src/services/local-time.js';
import { formatQrCode } from '../src/services/qr-code-format.js';
import type { TurnstileNotifier } from '../src/services/turnstile-notifier.js';
import { createTestContext, createUser, login, resetDatabase, sessionFor } from './helpers.js';

/** Dublê que guarda cada aviso e, se pedido, falha como um broker fora do ar. */
class SpyNotifier implements TurnstileNotifier {
  calls: { terminalId: string; decision: AccessDecision }[] = [];
  fail = false;

  notify(terminalId: string, decision: AccessDecision): Promise<void> {
    this.calls.push({ terminalId, decision });
    return this.fail ? Promise.reject(new Error('broker fora do ar')) : Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

const notifier = new SpyNotifier();
const ctx = createTestContext({}, { turnstileNotifier: notifier });
const { app, container } = ctx;
const db = container.prisma;

const POSITION = { latitude: -23.30501, longitude: -45.96581 };
let admin: User;
let ana: User;
let anaAuth: string;
let terminalId: string;
let terminalAuth: string;
let turnstileId: string;

beforeEach(async () => {
  await resetDatabase(db);
  notifier.calls = [];
  notifier.fail = false;

  const session = await sessionFor(ctx, Role.ADMIN);
  admin = session.user;
  ana = await createUser(ctx, { name: 'Ana Souza' });
  await db.user.update({ where: { id: ana.id }, data: { nfcUid: '04A1B2C3' } });
  anaAuth = `Bearer ${(await login(app, ana.email)).accessToken}`;

  const building = await db.location.create({
    data: { type: LocationType.BUILDING, name: 'Edifício', ...POSITION },
  });
  const gatehouse = await db.location.create({
    data: { type: LocationType.GATEHOUSE, name: 'Portaria', parentId: building.id },
  });
  const door = await db.location.create({
    data: { type: LocationType.DOOR, name: 'Porta', parentId: gatehouse.id },
  });
  const turnstile = await db.location.create({
    data: { type: LocationType.TURNSTILE, name: 'Catraca', parentId: door.id, ...POSITION },
  });
  turnstileId = turnstile.id;
  const created = await request(app)
    .post('/api/v1/terminals')
    .set('Authorization', session.auth)
    .send({ name: 'Terminal', locationId: turnstile.id });
  terminalId = created.body.terminal.id;
  terminalAuth = `Terminal ${created.body.credential}`;
});
afterAll(() => db.$disconnect());

function authorizeAna() {
  const today = localDate(new Date(), container.env.BUILDING_TIMEZONE);
  return db.authorization.create({
    data: {
      userId: ana.id,
      locationId: turnstileId,
      startDate: dateToDb(addDays(today, -1)),
      endDate: dateToDb(addDays(today, 1)),
      startTime: timeToDb('00:00:00'),
      endTime: timeToDb('23:59:59'),
      createdById: admin.id,
    },
  });
}

const nfc = (uid: string) =>
  request(app).post('/api/v1/access/nfc').set('Authorization', terminalAuth).send({ uid });

async function scanQr(position = POSITION) {
  const challenge = await request(app)
    .post('/api/v1/access/qr/challenge')
    .set('Authorization', terminalAuth);
  return request(app)
    .post('/api/v1/access/qr')
    .set('Authorization', anaAuth)
    .send({ code: challenge.body.code, ...position });
}

describe('aviso à catraca (NFC)', () => {
  it('GRANTED: avisa uma vez o terminal certo, depois de gravar o evento', async () => {
    await authorizeAna();
    const res = await nfc('04A1B2C3');

    expect(res.body.result).toBe('GRANTED');
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]).toMatchObject({
      terminalId,
      decision: { result: 'GRANTED', eventId: res.body.eventId },
    });
    expect(await db.accessEvent.count({ where: { id: res.body.eventId } })).toBe(1);
  });

  it('DENIED: também avisa uma vez', async () => {
    const res = await nfc('DEADBEEF');
    expect(res.body.result).toBe('DENIED');
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]).toMatchObject({
      terminalId,
      decision: { result: 'DENIED', denyReason: 'UNKNOWN_USER' },
    });
  });

  it('broker fora do ar: a rota responde 200 do mesmo jeito e o evento fica gravado', async () => {
    await authorizeAna();
    notifier.fail = true;

    const res = await nfc('04A1B2C3');

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('GRANTED');
    expect(await db.accessEvent.count()).toBe(1);
  });
});

describe('aviso à catraca e eventos no QR Code', () => {
  it('QR válido perto da catraca: aplica as regras, grava o evento e avisa o terminal', async () => {
    const auth = await authorizeAna();

    const res = await scanQr();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: 'GRANTED', denyReason: null, distanceMeters: 0 });
    const event = await db.accessEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event).toMatchObject({
      method: 'QR',
      userId: ana.id,
      terminalId,
      authorizationId: auth.id,
    });
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]).toMatchObject({ terminalId, decision: { result: 'GRANTED' } });
  });

  it('QR longe da catraca: DENIED OUT_OF_RANGE e o terminal é avisado', async () => {
    await authorizeAna();
    const res = await scanQr({
      latitude: POSITION.latitude + 0.0018,
      longitude: POSITION.longitude,
    });
    expect(res.body).toMatchObject({ result: 'DENIED', denyReason: 'OUT_OF_RANGE' });
    expect(res.body.distanceMeters).toBeGreaterThan(190);
    expect(notifier.calls).toHaveLength(1);
  });

  it('QR forjado: nega, grava o evento e não avisa nenhum terminal', async () => {
    const res = await request(app)
      .post('/api/v1/access/qr')
      .set('Authorization', anaAuth)
      .send({
        code: formatQrCode('019a0000-0000-7000-8000-000000000999', 'a'.repeat(22)),
        ...POSITION,
      });

    expect(res.body.denyReason).toBe('INVALID_CREDENTIAL');
    expect(await db.accessEvent.count()).toBe(1);
    expect(notifier.calls).toHaveLength(0);
  });

  it('broker fora do ar: o app recebe a decisão normalmente', async () => {
    await authorizeAna();
    notifier.fail = true;
    const res = await scanQr();
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('GRANTED');
  });
});

describe('MqttTurnstileNotifier', () => {
  const silent = pino({ level: 'silent' });
  const decision: AccessDecision = {
    result: 'GRANTED',
    denyReason: null,
    message: 'Acesso liberado',
    eventId: '019a0000-0000-7000-8000-00000000e001',
    authorizationId: null,
    user: null,
    distanceMeters: null,
  };

  it('sem conexão com o broker, falha na hora em vez de enfileirar', async () => {
    const offline = new MqttTurnstileNotifier({ url: 'mqtt://127.0.0.1:1' }, silent);
    await expect(offline.notify('t1', decision)).rejects.toThrow(/broker/);
    await offline.close();
  });

  // Precisa de um broker de verdade: MQTT_TEST_URL=mqtt://127.0.0.1:1883 com o Mosquitto do compose.
  it.skipIf(!process.env.MQTT_TEST_URL)(
    'publica a decisão em terminals/{id}/decision',
    async () => {
      const url = process.env.MQTT_TEST_URL as string;
      const subscriber = await connectAndWait(url);
      const received = new Promise<{ topic: string; payload: string }>((resolve) => {
        subscriber.on('message', (topic, payload) => {
          resolve({ topic, payload: payload.toString() });
        });
      });
      await subscriber.subscribeAsync('terminals/+/decision', { qos: 1 });

      const publisher = new MqttTurnstileNotifier({ url }, silent);
      await waitFor(() => publisher.isConnected());
      await publisher.notify('t1', decision);

      const message = await received;
      expect(message.topic).toBe('terminals/t1/decision');
      expect(JSON.parse(message.payload)).toMatchObject({
        result: 'GRANTED',
        message: 'Acesso liberado',
        eventId: decision.eventId,
        ts: expect.any(String),
      });
      await publisher.close();
      await subscriber.endAsync();
    },
  );
});

async function connectAndWait(url: string) {
  const client = connect(url);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => {
      resolve();
    });
    client.once('error', reject);
  });
  return client;
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('tempo esgotado');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
