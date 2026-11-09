import type { AccessEvent, Authorization, Prisma, User } from '../generated/prisma/client.js';
import {
  AccessMethod,
  AccessResult,
  AuthorizationStatus,
  DenyReason,
} from '../generated/prisma/enums.js';
import type { AccessEventRepository } from '../repositories/access-event.repository.js';
import type { AuthorizationRepository } from '../repositories/authorization.repository.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import type { TerminalRepository } from '../repositories/terminal.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { AccessAttempt, AccessDecider, AccessDecision } from './access-decision.js';
import { distanceInMeters, MAX_QR_DISTANCE_METERS } from './geo.js';
import {
  dateFromDb,
  timeFromDb,
  toLocalDateTime,
  type Clock,
  type DateOnly,
  type TimeOfDay,
} from './local-time.js';

/**
 * Texto curto para o display do terminal (16 colunas, sem acento) e para o app.
 * O app pode trocar por um texto mais completo usando o `denyReason`.
 */
export const ACCESS_MESSAGES: Record<DenyReason | 'GRANTED', string> = {
  GRANTED: 'Acesso liberado',
  INVALID_CREDENTIAL: 'Codigo invalido',
  EXPIRED_CREDENTIAL: 'Codigo expirado',
  CREDENTIAL_ALREADY_USED: 'Codigo ja usado',
  UNKNOWN_USER: 'Nao identificado',
  USER_INACTIVE: 'Usuario inativo',
  TERMINAL_INACTIVE: 'Terminal inativo',
  NO_AUTHORIZATION: 'Sem autorizacao',
  AUTHORIZATION_CANCELLED: 'Acesso cancelado',
  OUTSIDE_DATE_RANGE: 'Fora do periodo',
  OUTSIDE_TIME_WINDOW: 'Fora do horario',
  USAGE_LIMIT_REACHED: 'Limite de usos',
  OUT_OF_RANGE: 'Longe da catraca',
};

/** Verificações feitas em cada autorização, na ordem. A posição mede "até onde chegou". */
const AUTHORIZATION_CHECKS = [
  DenyReason.AUTHORIZATION_CANCELLED,
  DenyReason.OUTSIDE_DATE_RANGE,
  DenyReason.OUTSIDE_TIME_WINDOW,
  DenyReason.USAGE_LIMIT_REACHED,
] as const;
type AuthorizationCheck = (typeof AUTHORIZATION_CHECKS)[number];

/** Primeira regra que a autorização não cumpre agora, ou `null` se ela vale. */
export function failedCheck(
  authorization: Pick<
    Authorization,
    'status' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'maxUses' | 'usesCount'
  >,
  date: DateOnly,
  time: TimeOfDay,
): AuthorizationCheck | null {
  if (authorization.status !== AuthorizationStatus.ACTIVE) {
    return DenyReason.AUTHORIZATION_CANCELLED;
  }
  if (date < dateFromDb(authorization.startDate) || date > dateFromDb(authorization.endDate)) {
    return DenyReason.OUTSIDE_DATE_RANGE;
  }
  // Janela inclusiva nas duas pontas: 00:00:00 às 23:59:59 vale o dia inteiro.
  if (time < timeFromDb(authorization.startTime) || time > timeFromDb(authorization.endTime)) {
    return DenyReason.OUTSIDE_TIME_WINDOW;
  }
  if (authorization.maxUses !== null && authorization.usesCount >= authorization.maxUses) {
    return DenyReason.USAGE_LIMIT_REACHED;
  }
  return null;
}

type EventData = Omit<
  Prisma.AccessEventUncheckedCreateInput,
  'result' | 'denyReason' | 'authorizationId'
>;

/**
 * Motor de decisão de acesso (US7, US8): toda tentativa, por QR ou NFC, passa por aqui.
 * Aplica as regras na ordem abaixo (a primeira que falhar define o motivo), grava
 * exatamente um `AccessEvent` e devolve a decisão.
 *
 * 0. negação já detectada por quem chama (`presetDeny`)
 * 1. terminal existe e está ativo, e a catraca dele também → `TERMINAL_INACTIVE`
 * 2. pessoa identificada e cadastrada → `UNKNOWN_USER`
 * 3. pessoa ativa → `USER_INACTIVE`
 * 4. só no QR: celular a até 100 m da catraca → `OUT_OF_RANGE`
 * 5. autorização na catraca ou num local acima dela → `NO_AUTHORIZATION`
 * 6–9. ativa, dentro do período, dentro da janela diária e abaixo do limite de usos
 *
 * Com várias autorizações, vale a primeira que passar em tudo. Se nenhuma passar, o motivo
 * é o da que chegou mais longe nas verificações 6–9.
 */
export class AccessDecisionService implements AccessDecider {
  constructor(
    private readonly terminals: TerminalRepository,
    private readonly users: UserRepository,
    private readonly locations: LocationRepository,
    private readonly authorizations: AuthorizationRepository,
    private readonly events: AccessEventRepository,
    private readonly clock: Clock,
    private readonly timeZone: string,
  ) {}

  async decide(attempt: AccessAttempt): Promise<AccessDecision> {
    const now = this.clock.now();
    const [terminal, user] = await Promise.all([
      attempt.terminalId ? this.terminals.findByIdWithLocation(attempt.terminalId) : null,
      attempt.userId ? this.users.findById(attempt.userId) : null,
    ]);
    const turnstile = terminal?.location ?? null;

    const distance =
      attempt.position && turnstile?.latitude != null && turnstile.longitude != null
        ? distanceInMeters(attempt.position, {
            latitude: turnstile.latitude,
            longitude: turnstile.longitude,
          })
        : null;

    // O evento registra o que se sabe, mesmo na negação. Ids que não existem no banco
    // (tag de ninguém, terminal apagado) ficam nulos; a credencial apresentada fica em `credential`.
    const event: EventData = {
      occurredAt: now,
      method: attempt.method,
      credential: attempt.credential,
      userId: user?.id ?? null,
      terminalId: terminal?.id ?? null,
      locationId: turnstile?.id ?? null,
      latitude: attempt.position?.latitude ?? null,
      longitude: attempt.position?.longitude ?? null,
      distanceMeters: distance,
    };
    const deny = (reason: DenyReason, authorizationId: string | null = null) =>
      this.deny(event, user, reason, authorizationId);

    if (attempt.presetDeny) return deny(attempt.presetDeny);
    if (!terminal?.active || !turnstile?.active) return deny(DenyReason.TERMINAL_INACTIVE);
    if (!user) return deny(DenyReason.UNKNOWN_USER);
    if (!user.active) return deny(DenyReason.USER_INACTIVE);
    if (
      attempt.method === AccessMethod.QR &&
      (distance === null || distance > MAX_QR_DISTANCE_METERS)
    ) {
      return deny(DenyReason.OUT_OF_RANGE);
    }

    const locationIds = await this.locations.findAncestorIds(turnstile.id);
    const found = await this.authorizations.findForAccess(user.id, locationIds);
    if (found.length === 0) return deny(DenyReason.NO_AUTHORIZATION);

    const { date, time } = toLocalDateTime(now, this.timeZone);
    const checked = found.map((authorization) => ({
      authorization,
      failed: failedCheck(authorization, date, time),
    }));

    // Entre as válidas, gasta primeiro a sem limite de usos e, depois, a mais próxima da catraca.
    const valid = checked
      .filter((c) => c.failed === null)
      .map((c) => c.authorization)
      .sort(
        (a, b) =>
          Number(a.maxUses !== null) - Number(b.maxUses !== null) ||
          locationIds.indexOf(a.locationId) - locationIds.indexOf(b.locationId),
      );
    for (const authorization of valid) {
      const granted = await this.events.createGranted(authorization, {
        ...event,
        result: AccessResult.GRANTED,
        denyReason: null,
        authorizationId: authorization.id,
      });
      if (granted) return toDecision(granted, user);
    }
    // Havia autorização válida, mas outra leitura gastou o último uso antes desta.
    if (valid[0]) return deny(DenyReason.USAGE_LIMIT_REACHED, valid[0].id);

    const furthest = checked.reduce((best, c) =>
      progress(c.failed) > progress(best.failed) ? c : best,
    );
    return deny(furthest.failed ?? DenyReason.USAGE_LIMIT_REACHED, furthest.authorization.id);
  }

  private async deny(
    event: EventData,
    user: User | null,
    reason: DenyReason,
    authorizationId: string | null,
  ): Promise<AccessDecision> {
    const created = await this.events.create({
      ...event,
      result: AccessResult.DENIED,
      denyReason: reason,
      authorizationId,
    });
    return toDecision(created, user);
  }
}

function progress(failed: AuthorizationCheck | null): number {
  return failed === null ? AUTHORIZATION_CHECKS.length : AUTHORIZATION_CHECKS.indexOf(failed);
}

function toDecision(event: AccessEvent, user: User | null): AccessDecision {
  return {
    result: event.result,
    denyReason: event.denyReason,
    message: ACCESS_MESSAGES[event.denyReason ?? 'GRANTED'],
    eventId: event.id,
    authorizationId: event.authorizationId,
    user: user ? { id: user.id, name: user.name } : null,
    distanceMeters: event.distanceMeters,
  };
}
