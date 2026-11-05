import { SignJWT, UnsecuredJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../src/generated/prisma/enums.js';
import { generateOpaqueToken, sha256, TokenService } from '../../src/services/token.service.js';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const service = new TokenService(SECRET, 900);
const claims = { userId: '0193a1b2-0000-7000-8000-000000000001', role: Role.ADMIN };

describe('TokenService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('assina e confere o JWT de acesso', async () => {
    const token = await service.signAccessToken(claims);
    await expect(service.verifyAccessToken(token)).resolves.toEqual(claims);
  });

  it('recusa token expirado com TOKEN_EXPIRED', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = await service.signAccessToken(claims);
    vi.setSystemTime(Date.now() + 901_000);
    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('recusa token assinado com outro segredo', async () => {
    const other = new TokenService('outro-segredo-com-mais-de-32-caracteres!!', 900);
    const token = await other.signAccessToken(claims);
    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('recusa token sem assinatura (alg none)', async () => {
    const token = new UnsecuredJWT({ role: 'ADMIN' })
      .setSubject(claims.userId)
      .setIssuer('controle-acesso-api')
      .setAudience('controle-acesso')
      .setExpirationTime('5m')
      .encode();
    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('recusa token com perfil desconhecido', async () => {
    const token = await new SignJWT({ role: 'SUPERUSER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer('controle-acesso-api')
      .setAudience('controle-acesso')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));
    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('recusa token de outra audiência', async () => {
    const token = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer('controle-acesso-api')
      .setAudience('outro-sistema')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));
    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });
});

describe('token opaco', () => {
  it('gera 256 bits aleatórios em base64url', () => {
    const a = generateOpaqueToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(generateOpaqueToken()).not.toBe(a);
  });

  it('sha256 é determinístico e em hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
