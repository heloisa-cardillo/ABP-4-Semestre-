import { Role } from '../generated/prisma/enums.js';
import {
  FULL_DAY,
  type AuthorizationDetails,
  type CancelAuthorizationInput,
  type CreateAuthorizationInput,
  type ListAuthorizationsQuery,
  type ListMyAuthorizationsQuery,
} from '../models/authorization.schemas.js';
import type {
  AuthorizationRepository,
  NewAuthorization,
} from '../repositories/authorization.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import { isUniqueViolation } from '../repositories/prisma-errors.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { AppError } from '../shared/app-error.js';
import type { AuthContext } from '../shared/auth-context.js';
import { dateToDb, timeToDb, type Clock } from './local-time.js';
import type { PasswordHasher } from './password-hasher.js';

const authorizationNotFound = () => AppError.notFound('Autorização não encontrada.');

/**
 * Autorizações de acesso (RF03): quem pode entrar, em qual local, em que período,
 * em que horário e quantas vezes. Criadas e canceladas pelo administrador.
 */
export class AuthorizationService {
  constructor(
    private readonly authorizations: AuthorizationRepository,
    private readonly users: UserRepository,
    private readonly locations: LocationRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  /** Data de hoje no fuso do edifício, para calcular a situação das autorizações. */
  today(): string {
    return this.clock.today();
  }

  async create(actor: AuthContext, input: CreateAuthorizationInput): Promise<AuthorizationDetails> {
    if (input.endDate < this.clock.today()) {
      throw AppError.unprocessable('END_DATE_IN_PAST', 'A data de término já passou.');
    }
    await this.assertLocationUsable(input.locationId);

    const data: NewAuthorization = {
      locationId: input.locationId,
      startDate: dateToDb(input.startDate),
      endDate: dateToDb(input.endDate),
      startTime: timeToDb(input.startTime ?? FULL_DAY.startTime),
      endTime: timeToDb(input.endTime ?? FULL_DAY.endTime),
      maxUses: input.maxUses ?? null,
      createdById: actor.userId,
    };

    if (input.visitor) {
      const { visitor } = input;
      const passwordHash = await this.hasher.hash(visitor.password);
      try {
        return await this.authorizations.createWithVisitor(
          {
            name: visitor.name,
            email: visitor.email,
            passwordHash,
            role: Role.VISITOR,
            phone: visitor.phone ?? null,
          },
          data,
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw AppError.conflict('EMAIL_IN_USE', 'Já existe um usuário com este e-mail.');
        }
        throw err;
      }
    }

    // O schema garante que, sem `visitor`, `userId` veio preenchido.
    const userId = input.userId as string;
    await this.assertUserUsable(userId);
    return this.authorizations.create(userId, data);
  }

  list(query: ListAuthorizationsQuery) {
    return this.authorizations.list(
      {
        userId: query.userId,
        locationId: query.locationId,
        from: query.from,
        to: query.to,
        situation: query.situation,
      },
      this.clock.today(),
      { page: query.page, pageSize: query.pageSize },
    );
  }

  /** Autorizações da própria pessoa logada (condômino ou visitante). */
  listMine(actor: AuthContext, query: ListMyAuthorizationsQuery) {
    return this.authorizations.list(
      { userId: actor.userId, from: query.from, to: query.to, situation: query.situation },
      this.clock.today(),
      { page: query.page, pageSize: query.pageSize },
    );
  }

  async get(id: string): Promise<AuthorizationDetails> {
    const authorization = await this.authorizations.findById(id);
    if (!authorization) throw authorizationNotFound();
    return authorization;
  }

  /** Cancela em vez de apagar: o histórico de acessos continua apontando para a autorização. */
  async cancel(
    actor: AuthContext,
    id: string,
    input: CancelAuthorizationInput,
  ): Promise<AuthorizationDetails> {
    await this.get(id);
    const cancelled = await this.authorizations.cancel(
      id,
      actor.userId,
      input.reason ?? null,
      this.clock.now(),
    );
    if (!cancelled) {
      throw AppError.conflict('ALREADY_CANCELLED', 'Esta autorização já foi cancelada.');
    }
    return this.get(id);
  }

  private async assertUserUsable(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw AppError.unprocessable('USER_NOT_FOUND', 'A pessoa informada não existe.');
    }
    if (!user.active) {
      throw AppError.unprocessable('USER_INACTIVE', 'A pessoa informada está desativada.');
    }
  }

  private async assertLocationUsable(locationId: string): Promise<void> {
    const location = await this.locations.findById(locationId);
    if (!location) {
      throw AppError.unprocessable('LOCATION_NOT_FOUND', 'O local informado não existe.');
    }
    if (!location.active) {
      throw AppError.unprocessable('LOCATION_INACTIVE', 'O local informado está desativado.');
    }
  }
}
