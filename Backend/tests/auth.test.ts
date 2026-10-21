import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/enums.js';
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

beforeEach(() => resetDatabase(container.prisma));
afterAll(() => container.prisma.$disconnect());

describe('POST /auth/login', () => {
  it('devolve sessão com JWT, refresh token e dados públicos do usuário', async () => {
    const user = await createUser(ctx, { role: Role.VISITOR, name: 'Ana Visitante' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { id: user.id, name: 'Ana Visitante', role: 'VISITOR', active: true },
    });
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.refreshToken).toMatch(/^[\w-]{43}$/);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('aceita o e-mail com maiúsculas e espaços', async () => {
    const user = await createUser(ctx, { email: 'maria@teste.com' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '  Maria@Teste.COM ', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('senha errada e e-mail inexistente dão a mesma resposta', async () => {
    const user = await createUser(ctx);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'errada-123' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ninguem@teste.com', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('usuário desativado não entra, mesmo com a senha certa', async () => {
    const user = await createUser(ctx);
    await container.prisma.user.update({ where: { id: user.id }, data: { active: false } });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('valida a entrada e recusa campos desconhecidos', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nao-e-email', password: '', role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = (res.body.error.details as { field: string }[]).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('bloqueia força bruta com 429 depois do limite', async () => {
    const limited = createTestContext({ AUTH_RATE_LIMIT_MAX: '3' });
    const attempt = () =>
      request(limited.app)
        .post('/api/v1/auth/login')
        .send({ email: 'alvo@teste.com', password: 'chute-123' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');

    // Outro e-mail no mesmo IP continua podendo tentar.
    const other = await request(limited.app)
      .post('/api/v1/auth/login')
      .send({ email: 'outra@teste.com', password: 'chute-123' });
    expect(other.status).toBe(401);
    await limited.container.prisma.$disconnect();
  });
});

describe('POST /auth/refresh', () => {
  it('troca o refresh token por uma sessão nova', async () => {
    const user = await createUser(ctx);
    const first = await login(app, user.email);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(first.refreshToken);
    expect(res.body.user.id).toBe(user.id);
  });

  it('reuso de token já trocado derruba a sessão inteira', async () => {
    const user = await createUser(ctx);
    const first = await login(app, user.email);
    const second = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken });

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // O token legítimo mais novo também deixou de valer.
    const afterReplay = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.body.refreshToken });
    expect(afterReplay.status).toBe(401);
  });

  it('reuso derruba só a sessão daquele aparelho', async () => {
    const user = await createUser(ctx);
    const phone = await login(app, user.email);
    const tablet = await login(app, user.email);
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: phone.refreshToken });
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: phone.refreshToken });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tablet.refreshToken });
    expect(res.status).toBe(200);
  });

  it('recusa token desconhecido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(43) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('recusa token expirado', async () => {
    const user = await createUser(ctx);
    const session = await login(app, user.email);
    await container.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('recusa renovação de usuário desativado', async () => {
    const user = await createUser(ctx);
    const session = await login(app, user.email);
    await container.prisma.user.update({ where: { id: user.id }, data: { active: false } });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
  });

  it('duas renovações simultâneas com o mesmo token: no máximo uma passa', async () => {
    const user = await createUser(ctx);
    const session = await login(app, user.email);

    const results = await Promise.all(
      [1, 2].map(() =>
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }),
      ),
    );

    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(results.some((r) => r.status === 401)).toBe(true);
  });
});

describe('POST /auth/logout', () => {
  it('encerra a sessão: o refresh token deixa de valer', async () => {
    const user = await createUser(ctx);
    const session = await login(app, user.email);

    const out = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: session.refreshToken });
    expect(out.status).toBe(204);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
  });

  it('é idempotente com token desconhecido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'y'.repeat(43) });
    expect(res.status).toBe(204);
  });
});

describe('GET /auth/me', () => {
  it('devolve o usuário do token', async () => {
    const { user, auth } = await sessionFor(ctx, Role.RESIDENT);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, role: 'RESIDENT' });
  });

  it('sem token responde 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token adulterado responde 401 INVALID_TOKEN', async () => {
    const { session } = await sessionFor(ctx);
    const [header, payload, signature] = session.accessToken.split('.');
    const forged = `${header}.${payload}.${signature!.slice(0, -4)}AAAA`;
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('esquema diferente de Bearer responde 401', async () => {
    const { session } = await sessionFor(ctx);
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Basic ${session.accessToken}`);
    expect(res.status).toBe(401);
  });
});
