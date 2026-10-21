import { randomUUID } from 'node:crypto';
import type { User } from '../generated/prisma/client.js';
import { type Session } from '../models/auth.schemas.js';
import { toPublicUser } from '../models/user.schemas.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { AppError } from '../shared/app-error.js';
import type { PasswordHasher } from './password-hasher.js';
import { generateOpaqueToken, sha256, type TokenService } from './token.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const invalidCredentials = () =>
  AppError.unauthorized('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
const invalidRefreshToken = () =>
  AppError.unauthorized(
    'Sessão inválida ou expirada. Faça login novamente.',
    'INVALID_REFRESH_TOKEN',
  );
const refreshTokenReused = () =>
  AppError.unauthorized(
    'Sessão encerrada por segurança. Faça login novamente.',
    'REFRESH_TOKEN_REUSED',
  );

/**
 * Login, renovação e encerramento de sessão (RF07).
 *
 * A sessão é um par: JWT de acesso curto (sem estado) e refresh token opaco (com estado no banco).
 * Cada renovação troca o refresh token. Se um token já trocado aparecer de novo, alguém o copiou:
 * a família inteira é revogada e o dono precisa entrar de novo.
 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly refreshTokenTtlDays: number,
  ) {}

  async login(email: string, password: string): Promise<Session> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      await this.hasher.verifyAgainstDummy(password);
      throw invalidCredentials();
    }
    const passwordMatches = await this.hasher.verify(user.passwordHash, password);
    // Usuário desativado recebe a mesma resposta de senha errada: não revela o estado da conta.
    if (!passwordMatches || !user.active) throw invalidCredentials();

    const refreshToken = generateOpaqueToken();
    await this.refreshTokens.create({
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: sha256(refreshToken),
      expiresAt: this.refreshTokenExpiry(),
    });
    return this.buildSession(user, refreshToken);
  }

  async refresh(refreshToken: string): Promise<Session> {
    const stored = await this.refreshTokens.findByHash(sha256(refreshToken));
    if (!stored) throw invalidRefreshToken();

    if (stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw refreshTokenReused();
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw invalidRefreshToken();

    const user = await this.users.findById(stored.userId);
    if (!user?.active) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw invalidRefreshToken();
    }

    const nextToken = generateOpaqueToken();
    const rotated = await this.refreshTokens.rotate(stored.id, {
      userId: user.id,
      familyId: stored.familyId,
      tokenHash: sha256(nextToken),
      expiresAt: this.refreshTokenExpiry(),
    });
    if (!rotated) {
      // Outra renovação com o mesmo token ganhou a corrida: tratar como reuso.
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw refreshTokenReused();
    }
    return this.buildSession(user, nextToken);
  }

  /** Encerra a sessão deste aparelho. Idempotente: token desconhecido não é erro. */
  async logout(refreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(sha256(refreshToken));
    if (stored) await this.refreshTokens.revokeFamily(stored.familyId);
  }

  private async buildSession(user: User, refreshToken: string): Promise<Session> {
    return {
      tokenType: 'Bearer',
      accessToken: await this.tokens.signAccessToken({ userId: user.id, role: user.role }),
      expiresIn: this.tokens.accessTokenTtlSeconds,
      refreshToken,
      user: toPublicUser(user),
    };
  }

  private refreshTokenExpiry(): Date {
    return new Date(Date.now() + this.refreshTokenTtlDays * DAY_MS);
  }
}
