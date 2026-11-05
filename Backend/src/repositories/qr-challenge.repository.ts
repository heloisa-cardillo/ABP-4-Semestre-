import type { PrismaClient, QrChallenge } from '../generated/prisma/client.js';

export class QrChallengeRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<QrChallenge | null> {
    return this.db.qrChallenge.findUnique({ where: { id } });
  }

  create(data: { terminalId: string; secretHash: string; expiresAt: Date }): Promise<QrChallenge> {
    return this.db.qrChallenge.create({ data });
  }

  /**
   * Marca o código como usado se ainda estiver dentro do prazo e sem uso, numa única instrução:
   * duas leituras simultâneas do mesmo QR não passam as duas. Devolve `false` se não deu.
   */
  async consume(id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.qrChallenge.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return count === 1;
  }

  /** Limpeza: o terminal gera um código a cada 10 s, então os vencidos se acumulam rápido. */
  async deleteExpired(terminalId: string, before: Date): Promise<void> {
    await this.db.qrChallenge.deleteMany({ where: { terminalId, expiresAt: { lt: before } } });
  }
}
