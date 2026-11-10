import type { AccessEvent, Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AuthorizationStatus } from '../generated/prisma/enums.js';

/**
 * Histórico de tentativas de acesso. Só insere: o banco recusa UPDATE e DELETE
 * em `access_events`.
 */
export class AccessEventRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: Prisma.AccessEventUncheckedCreateInput): Promise<AccessEvent> {
    return this.db.accessEvent.create({ data });
  }

  /**
   * Gasta um uso da autorização e grava o evento de acesso liberado, na mesma transação.
   * O incremento só acontece se a autorização ainda estiver ativa e abaixo do limite:
   * duas leituras ao mesmo tempo não passam do `maxUses`. Devolve `null` se não deu
   * (alguém usou antes ou ela foi cancelada nesse meio-tempo); aí nada é gravado.
   */
  createGranted(
    authorization: { id: string; maxUses: number | null },
    data: Prisma.AccessEventUncheckedCreateInput,
  ): Promise<AccessEvent | null> {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.authorization.updateMany({
        where: {
          id: authorization.id,
          status: AuthorizationStatus.ACTIVE,
          ...(authorization.maxUses !== null && { usesCount: { lt: authorization.maxUses } }),
        },
        data: { usesCount: { increment: 1 } },
      });
      if (count === 0) return null;
      return tx.accessEvent.create({ data });
    });
  }
}
