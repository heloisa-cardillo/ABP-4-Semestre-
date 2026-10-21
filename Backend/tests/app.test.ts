import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

describe('API base', () => {
  const { app, container } = createTestContext();

  afterAll(() => container.prisma.$disconnect());

  it('GET /api/v1/health responde 200 com status ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('GET /api/v1/health/ready confirma o banco de pé', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('GET /api/v1/health/ready responde 503 quando o banco não responde', async () => {
    const offline = createTestContext({
      DATABASE_URL: 'postgresql://ninguem:nada@127.0.0.1:1/inexistente_test',
    });
    const res = await request(offline.app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable', database: 'down' });
    await offline.container.prisma.$disconnect();
  });

  it('rota inexistente responde 404 no formato de erro padrão', async () => {
    const res = await request(app).get('/api/v1/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Rota GET /api/v1/nao-existe não existe.' },
    });
  });

  it('JSON malformado responde 400 sem vazar detalhe interno', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"quebrado":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });

  it('aplica cabeçalhos de segurança e esconde o X-Powered-By', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('publica o documento OpenAPI com todas as rotas', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/health', '/auth/login', '/auth/refresh', '/users', '/users/{id}']),
    );
  });
});
