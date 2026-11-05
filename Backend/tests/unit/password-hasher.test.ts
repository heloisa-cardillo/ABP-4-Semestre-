import { describe, expect, it } from 'vitest';
import { PasswordHasher } from '../../src/services/password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('gera hash Argon2id com os parâmetros do OWASP', async () => {
    const hash = await hasher.hash('Senha@12345');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hasher.hash('Senha@12345');
    await expect(hasher.verify(hash, 'Senha@12345')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'senha@12345')).resolves.toBe(false);
  });

  it('hash corrompido conta como senha errada, sem lançar erro', async () => {
    await expect(hasher.verify('nao-e-um-hash', 'qualquer')).resolves.toBe(false);
  });

  it('verificação fictícia sempre devolve false', async () => {
    await expect(hasher.verifyAgainstDummy('qualquer')).resolves.toBe(false);
  });
});
