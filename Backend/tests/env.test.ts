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

describe('loadEnv: acesso e MQTT', () => {
  it('MQTT é opcional: ausente ou vazio deixa o aviso à catraca desligado', () => {
    expect(loadEnv(REQUIRED).MQTT_URL).toBeUndefined();
    const empty = loadEnv({ ...REQUIRED, MQTT_URL: '', MQTT_USERNAME: '', MQTT_PASSWORD: '' });
    expect(empty.MQTT_URL).toBeUndefined();
    expect(empty.MQTT_USERNAME).toBeUndefined();
  });

  it('aceita URL de broker MQTT e recusa outro esquema', () => {
    expect(loadEnv({ ...REQUIRED, MQTT_URL: 'mqtt://mosquitto:1883' }).MQTT_URL).toBe(
      'mqtt://mosquitto:1883',
    );
    expect(() => loadEnv({ ...REQUIRED, MQTT_URL: 'http://broker' })).toThrow(/MQTT_URL/);
  });

  it('limite de leituras por terminal: 60 por minuto por padrão', () => {
    expect(loadEnv(REQUIRED).TERMINAL_ACCESS_RATE_LIMIT_MAX).toBe(60);
  });
});
