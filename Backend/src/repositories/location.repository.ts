import type { Location, Prisma, PrismaClient, Terminal } from '../generated/prisma/client.js';
import type { LocationType } from '../generated/prisma/enums.js';
import type { PageRequest } from './user.repository.js';

export interface LocationFilter {
  type?: LocationType | undefined;
  parentId?: string | undefined;
  active?: boolean | undefined;
  search?: string | undefined;
}

export class LocationRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<Location | null> {
    return this.db.location.findUnique({ where: { id } });
  }

  findByIdWithTerminal(id: string): Promise<(Location & { terminal: Terminal | null }) | null> {
    return this.db.location.findUnique({ where: { id }, include: { terminal: true } });
  }

  create(data: Prisma.LocationUncheckedCreateInput): Promise<Location> {
    return this.db.location.create({ data });
  }

  update(id: string, data: Prisma.LocationUpdateInput): Promise<Location> {
    return this.db.location.update({ where: { id }, data });
  }

  countActiveChildren(id: string): Promise<number> {
    return this.db.location.count({ where: { parentId: id, active: true } });
  }

  async list(filter: LocationFilter, { page, pageSize }: PageRequest) {
    const where: Prisma.LocationWhereInput = {
      ...(filter.type && { type: filter.type }),
      ...(filter.parentId && { parentId: filter.parentId }),
      ...(filter.active !== undefined && { active: filter.active }),
      ...(filter.search && { name: { contains: filter.search, mode: 'insensitive' } }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.location.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.location.count({ where }),
    ]);
    return { items, total };
  }
}
