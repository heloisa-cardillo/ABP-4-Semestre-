import type { AccessEvent, Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { AccessMethod, AccessResult } from '../generated/prisma/enums.js';
import { AuthorizationStatus } from '../generated/prisma/enums.js';
import type { AccessEventDetails } from '../models/access-event.schemas.js';
import type { PageRequest } from './user.repository.js';

export interface AccessEventFilter {
  userId?: string | undefined;
  /** Locais aceitos (o filtrado e os abaixo dele). Lista vazia não traz nada. */
  locationIds?: string[] | undefined;
  terminalId?: string | undefined;
  method?: AccessMethod | undefined;
  result?: AccessResult | undefined;
  /** Intervalo [since, until) de `occurredAt`. */
  since?: Date | undefined;
  until?: Date | undefined;
}

const details = {
  user: { select: { id: true, name: true, role: true } },
  location: { select: { id: true, name: true, type: true } },
  terminal: { select: { id: true, name: true } },
} satisfies Prisma.AccessEventInclude;

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

  /** Histórico paginado, da tentativa mais recente para a mais antiga. */
  async list(
    filter: AccessEventFilter,
    { page, pageSize }: PageRequest,
  ): Promise<{ items: AccessEventDetails[]; total: number }> {
    const where: Prisma.AccessEventWhereInput = {
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.locationIds && { locationId: { in: filter.locationIds } }),
      ...(filter.terminalId && { terminalId: filter.terminalId }),
      ...(filter.method && { method: filter.method }),
      ...(filter.result && { result: filter.result }),
      ...((filter.since || filter.until) && {
        occurredAt: {
          ...(filter.since && { gte: filter.since }),
          ...(filter.until && { lt: filter.until }),
        },
      }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.accessEvent.findMany({
        where,
        include: details,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.accessEvent.count({ where }),
    ]);
    return { items, total };
  }
}
