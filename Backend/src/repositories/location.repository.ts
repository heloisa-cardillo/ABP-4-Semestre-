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

  /**
   * O próprio local e todos os que estão acima dele, do mais próximo ao edifício.
   * Ex.: para uma catraca, `[catraca, porta, portaria, edifício]`. Local inexistente: `[]`.
   * O limite de profundidade só protege contra ciclo; a hierarquia tem 4 níveis.
   */
  async findAncestorIds(locationId: string): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, 0 AS depth FROM locations WHERE id = ${locationId}::uuid
        UNION ALL
        SELECT l.id, l.parent_id, chain.depth + 1
        FROM locations l JOIN chain ON l.id = chain.parent_id
        WHERE chain.depth < 10
      )
      SELECT id::text AS id FROM chain ORDER BY depth`;
    return rows.map((row) => row.id);
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
