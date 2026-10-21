import type { Logger } from 'pino';
import { createPrismaClient } from './config/database.js';
import type { Env } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { RefreshTokenRepository } from './repositories/refresh-token.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { AuthService } from './services/auth.service.js';
import { PasswordHasher } from './services/password-hasher.js';
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
  };
}

/**
 * Raiz de composição: o único lugar que instancia classes concretas.
 * Serviços recebem as dependências pelo construtor.
 */
export function createContainer(env: Env, logger: Logger): AppContainer {
  const prisma = createPrismaClient(env.DATABASE_URL);
  const hasher = new PasswordHasher();
  const tokens = new TokenService(env.JWT_SECRET, env.JWT_ACCESS_TTL_SECONDS);

  const userRepository = new UserRepository(prisma);
  const refreshTokenRepository = new RefreshTokenRepository(prisma);

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
    },
  };
}
