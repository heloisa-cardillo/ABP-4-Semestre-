import type { Prisma, PrismaClient, User } from '../generated/prisma/client.js';
import type { Role } from '../generated/prisma/enums.js';

export interface UserFilter {
  role?: Role | undefined;
  active?: boolean | undefined;
  /** Busca por parte do nome ou do e-mail, sem diferenciar maiúsculas. */
  search?: string | undefined;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.db.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.db.user.update({ where: { id }, data });
  }

  async list(filter: UserFilter, { page, pageSize }: PageRequest) {
    const where: Prisma.UserWhereInput = {
      ...(filter.role && { role: filter.role }),
      ...(filter.active !== undefined && { active: filter.active }),
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' } },
          { email: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return { items, total };
  }
}
