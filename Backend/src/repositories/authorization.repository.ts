import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AuthorizationStatus } from '../generated/prisma/enums.js';
import type { AuthorizationDetails } from '../models/authorization.schemas.js';
import type { AuthorizationSituation } from '../services/authorization-rules.js';
import { dateToDb, type DateOnly } from '../services/local-time.js';
import type { PageRequest } from './user.repository.js';

export interface AuthorizationFilter {
  userId?: string | undefined;
  locationId?: string | undefined;
  /** Traz as autorizações com pelo menos um dia dentro de [from, to]. */
  from?: DateOnly | undefined;
  to?: DateOnly | undefined;
  situation?: AuthorizationSituation | undefined;
}

export type NewAuthorization = Omit<Prisma.AuthorizationUncheckedCreateInput, 'userId'>;

const details = {
  user: { select: { id: true, name: true, role: true } },
  location: { select: { id: true, name: true, type: true } },
} satisfies Prisma.AuthorizationInclude;

export class AuthorizationRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<AuthorizationDetails | null> {
    return this.db.authorization.findUnique({ where: { id }, include: details });
  }

  create(userId: string, data: NewAuthorization): Promise<AuthorizationDetails> {
    return this.db.authorization.create({ data: { ...data, userId }, include: details });
  }

  /** Cria o visitante e a autorização dele juntos: se um falhar, nenhum fica gravado. */
  createWithVisitor(
    visitor: Prisma.UserCreateInput,
    data: NewAuthorization,
  ): Promise<AuthorizationDetails> {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: visitor });
      return tx.authorization.create({ data: { ...data, userId: user.id }, include: details });
    });
  }

  /**
   * Cancela só se ainda estiver ativa, numa única instrução: dois cancelamentos ao mesmo
   * tempo não sobrescrevem quem cancelou primeiro. Devolve `false` se já estava cancelada.
   */
  async cancel(
    id: string,
    cancelledById: string,
    reason: string | null,
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.db.authorization.updateMany({
      where: { id, status: AuthorizationStatus.ACTIVE },
      data: {
        status: AuthorizationStatus.CANCELLED,
        cancelledAt: now,
        cancelledById,
        cancelReason: reason,
      },
    });
    return count === 1;
  }

  async list(filter: AuthorizationFilter, today: DateOnly, { page, pageSize }: PageRequest) {
    const where: Prisma.AuthorizationWhereInput = {
      AND: [
        filter.userId ? { userId: filter.userId } : {},
        filter.locationId ? { locationId: filter.locationId } : {},
        filter.from ? { endDate: { gte: dateToDb(filter.from) } } : {},
        filter.to ? { startDate: { lte: dateToDb(filter.to) } } : {},
        filter.situation ? this.situationWhere(filter.situation, today) : {},
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.authorization.findMany({
        where,
        include: details,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.authorization.count({ where }),
    ]);
    return { items, total };
  }

  /** Mesma prioridade de `situationOf`, traduzida para SQL. */
  private situationWhere(
    situation: AuthorizationSituation,
    today: DateOnly,
  ): Prisma.AuthorizationWhereInput {
    const day = dateToDb(today);
    const active = { status: AuthorizationStatus.ACTIVE };
    const inPeriod = { startDate: { lte: day }, endDate: { gte: day } };
    const exhausted = {
      maxUses: { not: null },
      usesCount: { gte: this.db.authorization.fields.maxUses },
    };

    switch (situation) {
      case 'CANCELLED':
        return { status: AuthorizationStatus.CANCELLED };
      case 'EXPIRED':
        return { ...active, endDate: { lt: day } };
      case 'SCHEDULED':
        return { ...active, startDate: { gt: day }, endDate: { gte: day } };
      case 'EXHAUSTED':
        return { ...active, ...inPeriod, ...exhausted };
      case 'VALID':
        return { ...active, ...inPeriod, NOT: exhausted };
    }
  }
}
