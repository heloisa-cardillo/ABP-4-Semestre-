import type { Prisma, User } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '../models/user.schemas.js';
import { isRecordNotFound, isUniqueViolation } from '../repositories/prisma-errors.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { AuthContext } from '../shared/auth-context.js';
import { AppError } from '../shared/app-error.js';
import type { PasswordHasher } from './password-hasher.js';

const emailInUse = () => AppError.conflict('EMAIL_IN_USE', 'Já existe um usuário com este e-mail.');
const userNotFound = () => AppError.notFound('Usuário não encontrado.');

/** Cadastro de usuários nos perfis administrador, condômino e visitante (RF01). */
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const passwordHash = await this.hasher.hash(input.password);
    try {
      return await this.users.create({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        phone: input.phone ?? null,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw emailInUse();
      throw err;
    }
  }

  list(query: ListUsersQuery) {
    return this.users.list(
      { role: query.role, active: query.active, search: query.search },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  async get(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw userNotFound();
    return user;
  }

  async update(actor: AuthContext, id: string, input: UpdateUserInput): Promise<User> {
    if (actor.userId === id) assertNotLockingSelfOut(input);
    const current = await this.get(id);

    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.role !== undefined) data.role = input.role;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.active !== undefined) data.active = input.active;
    if (input.password !== undefined) data.passwordHash = await this.hasher.hash(input.password);

    let updated: User;
    try {
      updated = await this.users.update(id, data);
    } catch (err) {
      if (isUniqueViolation(err)) throw emailInUse();
      if (isRecordNotFound(err)) throw userNotFound();
      throw err;
    }

    // Senha trocada, perfil trocado ou conta desativada: as sessões abertas deixam de valer.
    const mustEndSessions =
      input.password !== undefined ||
      (input.role !== undefined && input.role !== current.role) ||
      input.active === false;
    if (mustEndSessions) await this.refreshTokens.revokeAllForUser(id);

    return updated;
  }

  /** Desativa em vez de apagar: o histórico de acessos continua apontando para o usuário. */
  async deactivate(actor: AuthContext, id: string): Promise<void> {
    await this.update(actor, id, { active: false });
  }
}

/** O administrador não pode se desativar nem tirar o próprio perfil de admin. */
function assertNotLockingSelfOut(input: UpdateUserInput): void {
  if (input.active === false || (input.role !== undefined && input.role !== Role.ADMIN)) {
    throw AppError.conflict(
      'SELF_LOCKOUT',
      'Você não pode desativar a própria conta nem remover o próprio perfil de administrador.',
    );
  }
}
