import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const REQUIRED = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('aplica os valores padrão', () => {
    const env = loadEnv(REQUIRED);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
  });

  it('converte a lista de origens do CORS', () => {
    const env = loadEnv({ ...REQUIRED, CORS_ORIGINS: 'http://a.com, http://b.com ,' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('falha listando cada variável inválida', () => {
    const run = () => loadEnv({ ...REQUIRED, PORT: 'abc', NODE_ENV: 'staging' });
    expect(run).toThrow(/PORT/);
    expect(run).toThrow(/NODE_ENV/);
  });

  it('exige banco e segredo do JWT', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });

  it('recusa segredo do JWT curto', () => {
    expect(() => loadEnv({ ...REQUIRED, JWT_SECRET: 'curto' })).toThrow(/32 caracteres/);
  });

  it('recusa URL de banco que não é PostgreSQL', () => {
    expect(() => loadEnv({ ...REQUIRED, DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(
      /DATABASE_URL/,
    );
  });
});
