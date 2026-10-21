import type { Location, Prisma, PrismaClient, Terminal } from '../generated/prisma/client.js';
import type { PageRequest } from './user.repository.js';

export class TerminalRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<Terminal | null> {
    return this.db.terminal.findUnique({ where: { id } });
  }

  findByIdWithLocation(id: string): Promise<(Terminal & { location: Location }) | null> {
    return this.db.terminal.findUnique({ where: { id }, include: { location: true } });
  }

  create(data: Prisma.TerminalUncheckedCreateInput): Promise<Terminal> {
    return this.db.terminal.create({ data });
  }

  update(id: string, data: Prisma.TerminalUpdateInput): Promise<Terminal> {
    return this.db.terminal.update({ where: { id }, data });
  }

  async touch(id: string): Promise<void> {
    await this.db.terminal.update({ where: { id }, data: { lastSeenAt: new Date() } });
  }

  async list(filter: { active?: boolean | undefined }, { page, pageSize }: PageRequest) {
    const where: Prisma.TerminalWhereInput =
      filter.active === undefined ? {} : { active: filter.active };
    const [items, total] = await this.db.$transaction([
      this.db.terminal.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.terminal.count({ where }),
    ]);
    return { items, total };
  }
}
