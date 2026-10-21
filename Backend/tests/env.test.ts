import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('aplica os valores padrão', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('converte a lista de origens do CORS', () => {
    const env = loadEnv({ CORS_ORIGINS: 'http://a.com, http://b.com ,' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('falha listando cada variável inválida', () => {
    expect(() => loadEnv({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
