import { randomUUID } from 'node:crypto';
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

const newUser = (overrides: Record<string, unknown> = {}) => ({
  name: 'Carlos Condômino',
  email: 'carlos@teste.com',
  password: 'SenhaForte123',
  role: 'RESIDENT',
  phone: '12988887777',
  ...overrides,
});

describe('permissões', () => {
  it('sem token responde 401', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it.each([Role.RESIDENT, Role.VISITOR])('perfil %s não acessa o cadastro (403)', async (role) => {
    const { auth } = await sessionFor(ctx, role);
    const list = await request(app).get('/api/v1/users').set('Authorization', auth);
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send(newUser());
    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /users', () => {
  it('admin cadastra usuário em cada perfil', async () => {
    const { auth } = await sessionFor(ctx);

    for (const role of ['ADMIN', 'RESIDENT', 'VISITOR']) {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send(newUser({ email: `${role.toLowerCase()}@teste.com`, role }));
      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/api/v1/users/${res.body.id}`);
      expect(res.body).toMatchObject({ role, active: true, phone: '12988887777' });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
    }
  });

  it('a senha é guardada como hash Argon2id e permite login', async () => {
    const { auth } = await sessionFor(ctx);
    await request(app).post('/api/v1/users').set('Authorization', auth).send(newUser());

    const stored = await container.prisma.user.findUniqueOrThrow({
      where: { email: 'carlos@teste.com' },
    });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(login(app, 'carlos@teste.com', 'SenhaForte123')).resolves.toBeDefined();
  });

  it('e-mail repetido (em qualquer caixa) responde 409', async () => {
    const { auth } = await sessionFor(ctx);
    await request(app).post('/api/v1/users').set('Authorization', auth).send(newUser());
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send(newUser({ email: 'CARLOS@teste.com' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
  });

  it.each([
    ['perfil inexistente', { role: 'SINDICO' }, 'role'],
    ['senha curta', { password: '123' }, 'password'],
    ['e-mail inválido', { email: 'carlos' }, 'email'],
    ['telefone com letras', { phone: '12-abc' }, 'phone'],
    ['campo não permitido', { active: false }, ''],
  ])('recusa %s com 400', async (_case, override, field) => {
    const { auth } = await sessionFor(ctx);
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send(newUser(override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    if (field) {
      expect((res.body.error.details as { field: string }[]).map((d) => d.field)).toContain(field);
    }
  });
});

describe('GET /users', () => {
  it('lista com paginação e filtros de perfil, situação e busca', async () => {
    const { auth } = await sessionFor(ctx);
    await createUser(ctx, { name: 'Beatriz Souza', role: Role.VISITOR });
    await createUser(ctx, { name: 'Bruno Lima', role: Role.VISITOR });
    const inactive = await createUser(ctx, { name: 'Bianca Inativa', role: Role.VISITOR });
    await container.prisma.user.update({ where: { id: inactive.id }, data: { active: false } });

    const page = await request(app)
      .get('/api/v1/users?role=VISITOR&pageSize=2&page=1')
      .set('Authorization', auth);
    expect(page.status).toBe(200);
    expect(page.body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(page.body.data.map((u: { name: string }) => u.name)).toEqual([
      'Beatriz Souza',
      'Bianca Inativa',
    ]);

    const active = await request(app)
      .get('/api/v1/users?role=VISITOR&active=true')
      .set('Authorization', auth);
    expect(active.body.meta.total).toBe(2);

    const search = await request(app).get('/api/v1/users?search=lima').set('Authorization', auth);
    expect(search.body.data.map((u: { name: string }) => u.name)).toEqual(['Bruno Lima']);
  });

  it('recusa paginação fora dos limites', async () => {
    const { auth } = await sessionFor(ctx);
    const res = await request(app).get('/api/v1/users?pageSize=500').set('Authorization', auth);
    expect(res.status).toBe(400);
  });
});

describe('GET /users/:id', () => {
  it('busca por id; inexistente responde 404 e id malformado 400', async () => {
    const { auth, user } = await sessionFor(ctx);

    const found = await request(app).get(`/api/v1/users/${user.id}`).set('Authorization', auth);
    expect(found.status).toBe(200);
    expect(found.body.email).toBe(user.email);

    const missing = await request(app)
      .get(`/api/v1/users/${randomUUID()}`)
      .set('Authorization', auth);
    expect(missing.status).toBe(404);

    const malformed = await request(app).get('/api/v1/users/123').set('Authorization', auth);
    expect(malformed.status).toBe(400);
  });
});

describe('PATCH /users/:id', () => {
  it('altera os dados e permite limpar o telefone', async () => {
    const { auth } = await sessionFor(ctx);
    const target = await createUser(ctx, { role: Role.VISITOR });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', auth)
      .send({ name: 'Novo Nome', role: 'RESIDENT', phone: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Novo Nome', role: 'RESIDENT', phone: null });
  });

  it('trocar a senha encerra as sessões abertas e vale no próximo login', async () => {
    const { auth } = await sessionFor(ctx);
    const target = await createUser(ctx);
    const targetSession = await login(app, target.email);

    await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', auth)
      .send({ password: 'OutraSenha456' })
      .expect(200);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: targetSession.refreshToken });
    expect(refresh.status).toBe(401);
    await expect(login(app, target.email, PASSWORD)).rejects.toThrow();
    await expect(login(app, target.email, 'OutraSenha456')).resolves.toBeDefined();
  });

  it('trocar o perfil encerra as sessões abertas', async () => {
    const { auth } = await sessionFor(ctx);
    const target = await createUser(ctx, { role: Role.VISITOR });
    const targetSession = await login(app, target.email);

    await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', auth)
      .send({ role: 'ADMIN' })
      .expect(200);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: targetSession.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('admin não pode se desativar nem tirar o próprio perfil', async () => {
    const { auth, user } = await sessionFor(ctx);

    for (const body of [{ active: false }, { role: 'VISITOR' }]) {
      const res = await request(app)
        .patch(`/api/v1/users/${user.id}`)
        .set('Authorization', auth)
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SELF_LOCKOUT');
    }
  });

  it('recusa corpo vazio e e-mail já usado', async () => {
    const { auth } = await sessionFor(ctx);
    const a = await createUser(ctx);
    const b = await createUser(ctx);

    const empty = await request(app)
      .patch(`/api/v1/users/${a.id}`)
      .set('Authorization', auth)
      .send({});
    expect(empty.status).toBe(400);

    const duplicate = await request(app)
      .patch(`/api/v1/users/${a.id}`)
      .set('Authorization', auth)
      .send({ email: b.email });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('usuário inexistente responde 404', async () => {
    const { auth } = await sessionFor(ctx);
    const res = await request(app)
      .patch(`/api/v1/users/${randomUUID()}`)
      .set('Authorization', auth)
      .send({ name: 'Ninguém' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /users/:id', () => {
  it('desativa sem apagar, encerra sessões e impede novo login', async () => {
    const { auth } = await sessionFor(ctx);
    const target = await createUser(ctx);
    const targetSession = await login(app, target.email);

    const res = await request(app).delete(`/api/v1/users/${target.id}`).set('Authorization', auth);
    expect(res.status).toBe(204);

    const stored = await container.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.active).toBe(false);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: targetSession.refreshToken });
    expect(refresh.status).toBe(401);
    await expect(login(app, target.email)).rejects.toThrow();
  });

  it('admin não pode desativar a si mesmo', async () => {
    const { auth, user } = await sessionFor(ctx);
    const res = await request(app).delete(`/api/v1/users/${user.id}`).set('Authorization', auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SELF_LOCKOUT');
  });
});
