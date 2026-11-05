import type { Logger } from 'pino';
import { createPrismaClient } from './config/database.js';
import type { Env } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { AuthorizationRepository } from './repositories/authorization.repository.js';
import { QrChallengeRepository } from './repositories/qr-challenge.repository.js';
import { LocationRepository } from './repositories/location.repository.js';
import { RefreshTokenRepository } from './repositories/refresh-token.repository.js';
import { TerminalRepository } from './repositories/terminal.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { UnavailableAccessDecider, type AccessDecider } from './services/access-decision.js';
import { AuthService } from './services/auth.service.js';
import { AuthorizationService } from './services/authorization.service.js';
import { systemClock } from './services/local-time.js';
import { LocationService } from './services/location.service.js';
import { PasswordHasher } from './services/password-hasher.js';
import { QrCodeService } from './services/qr-code.service.js';
import { TerminalService } from './services/terminal.service.js';
import { TokenService } from './services/token.service.js';
import { UserService } from './services/user.service.js';

export interface AppContainer {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  tokens: TokenService;
  services: {
    auth: AuthService;
    users: UserService;
    locations: LocationService;
    terminals: TerminalService;
    authorizations: AuthorizationService;
    accessDecider: AccessDecider;
    qr: QrCodeService;
  };
}

/**
 * Raiz de composição: o único lugar que instancia classes concretas.
 * Serviços recebem as dependências pelo construtor.
 */
/** Implementações que os testes podem trocar por dublês. */
export interface ContainerOverrides {
  accessDecider?: AccessDecider;
}

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
  const clock = systemClock(env.BUILDING_TIMEZONE);
  // Trocar pelo AccessDecisionService (Dev 2, tarefa T2) quando ele estiver pronto.
  const accessDecider = overrides.accessDecider ?? new UnavailableAccessDecider();

  return {
    env,
    logger,
    prisma,
    tokens,
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
      accessDecider,
      qr: new QrCodeService(
        new QrChallengeRepository(prisma),
        accessDecider,
        clock,
        env.QR_CODE_TTL_SECONDS,
      ),
    },
  };
}
