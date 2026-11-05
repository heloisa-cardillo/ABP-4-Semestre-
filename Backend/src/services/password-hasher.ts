import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de senha com Argon2id, a primeira recomendação do OWASP Password Storage Cheat Sheet.
 * Parâmetros: 19 MiB de memória, 2 iterações, 1 via (mínimo recomendado pelo OWASP).
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  /** Hash corrompido ou de outro formato conta como senha errada, nunca como erro 500. */
  async verify(passwordHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Gasta o mesmo tempo de uma verificação real e devolve sempre `false`.
   * Usado quando o e-mail não existe, para o tempo de resposta não revelar quem tem conta.
   */
  async verifyAgainstDummy(plain: string): Promise<false> {
    this.dummyHash ??= this.hash('senha-ficticia-so-para-igualar-o-tempo');
    await this.verify(await this.dummyHash, plain);
    return false;
  }
}
