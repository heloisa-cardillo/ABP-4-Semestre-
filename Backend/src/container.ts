import type { Logger } from 'pino';
import { MqttTurnstileNotifier } from './adapters/mqtt-turnstile-notifier.js';
import { createPrismaClient } from './config/database.js';
import type { Env } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { AccessEventRepository } from './repositories/access-event.repository.js';
import { AuthorizationRepository } from './repositories/authorization.repository.js';
import { QrChallengeRepository } from './repositories/qr-challenge.repository.js';
import { LocationRepository } from './repositories/location.repository.js';
import { RefreshTokenRepository } from './repositories/refresh-token.repository.js';
import { TerminalRepository } from './repositories/terminal.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import type { AccessDecider } from './services/access-decision.js';
import { AccessDecisionService } from './services/access-decision.service.js';
import { AccessService } from './services/access.service.js';
import { AuthService } from './services/auth.service.js';
import { AuthorizationService } from './services/authorization.service.js';
import { systemClock, type Clock } from './services/local-time.js';
import { LocationService } from './services/location.service.js';
import { PasswordHasher } from './services/password-hasher.js';
import { QrCodeService } from './services/qr-code.service.js';
import { TerminalService } from './services/terminal.service.js';
import { TokenService } from './services/token.service.js';
import { NoopTurnstileNotifier, type TurnstileNotifier } from './services/turnstile-notifier.js';
import { UserService } from './services/user.service.js';

export interface AppContainer {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  tokens: TokenService;
  turnstileNotifier: TurnstileNotifier;
  services: {
    auth: AuthService;
    users: UserService;
    locations: LocationService;
    terminals: TerminalService;
    authorizations: AuthorizationService;
    /** Motor de regras: decide e grava o evento. */
    accessDecision: AccessDecisionService;
    /** Entrada das rotas de acesso (NFC e QR): decide e avisa a catraca. */
    access: AccessService;
    qr: QrCodeService;
  };
}

/** Implementações que os testes podem trocar por dublês. */
export interface ContainerOverrides {
  /** Substitui o motor de regras nas rotas de acesso. */
  accessDecider?: AccessDecider;
  turnstileNotifier?: TurnstileNotifier;
  clock?: Clock;
}

/**
 * Raiz de composição: o único lugar que instancia classes concretas.
 * Serviços recebem as dependências pelo construtor.
 */
export function createContainer(
  env: Env,
  logger: Logger,
  overrides: ContainerOverrides = {},
): AppContainer {
  const prisma = createPrismaClient(env.DATABASE_URL);
  const hasher = new PasswordHasher();
  const tokens = new TokenService(env.JWT_SECRET, env.JWT_ACCESS_TTL_SECONDS);

  const userRepository = new UserRepository(prisma);
  const refreshTokenRepository = new RefreshTokenRepository(prisma);
  const locationRepository = new LocationRepository(prisma);
  const terminalRepository = new TerminalRepository(prisma);
  const authorizationRepository = new AuthorizationRepository(prisma);
  const clock = overrides.clock ?? systemClock(env.BUILDING_TIMEZONE);

  const accessDecision = new AccessDecisionService(
    terminalRepository,
    userRepository,
    locationRepository,
    authorizationRepository,
    new AccessEventRepository(prisma),
    clock,
    env.BUILDING_TIMEZONE,
  );
  // Sem broker configurado o aviso à catraca fica desligado.
  const turnstileNotifier =
    overrides.turnstileNotifier ??
    (env.MQTT_URL
      ? new MqttTurnstileNotifier(
          { url: env.MQTT_URL, username: env.MQTT_USERNAME, password: env.MQTT_PASSWORD },
          logger,
        )
      : new NoopTurnstileNotifier());
  const access = new AccessService(
    overrides.accessDecider ?? accessDecision,
    userRepository,
    turnstileNotifier,
    logger,
  );

  return {
    env,
    logger,
    prisma,
    tokens,
    turnstileNotifier,
    services: {
      auth: new AuthService(
        userRepository,
        refreshTokenRepository,
        hasher,
        tokens,
        env.REFRESH_TOKEN_TTL_DAYS,
      ),
      users: new UserService(userRepository, refreshTokenRepository, hasher),
      locations: new LocationService(locationRepository),
      terminals: new TerminalService(terminalRepository, locationRepository),
      authorizations: new AuthorizationService(
        authorizationRepository,
        userRepository,
        locationRepository,
        hasher,
        clock,
      ),
      accessDecision,
      access,
      qr: new QrCodeService(
        new QrChallengeRepository(prisma),
        access,
        clock,
        env.QR_CODE_TTL_SECONDS,
      ),
    },
  };
}
