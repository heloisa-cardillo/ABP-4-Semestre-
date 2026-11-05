import type { PrismaClient, RefreshToken } from '../generated/prisma/client.js';

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export class RefreshTokenRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: NewRefreshToken): Promise<RefreshToken> {
    return this.db.refreshToken.create({ data });
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.db.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Troca atômica: revoga o token atual e cria o próximo da mesma família.
   * Devolve `null` se o atual já tinha sido revogado, o que acontece quando duas
   * renovações chegam ao mesmo tempo com o mesmo token.
   */
  rotate(currentId: string, next: NewRefreshToken): Promise<RefreshToken | null> {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return null;
      return tx.refreshToken.create({ data: next });
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
