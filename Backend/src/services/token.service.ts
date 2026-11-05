import { createHash, randomBytes } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { Role } from '../generated/prisma/enums.js';
import type { AuthContext } from '../shared/auth-context.js';
import { AppError } from '../shared/app-error.js';

const ISSUER = 'controle-acesso-api';
const AUDIENCE = 'controle-acesso';
const ALGORITHM = 'HS256';
const ROLES = new Set<string>(Object.values(Role));

/** Emite e confere o JWT de acesso. Não guarda estado: a revogação mora no refresh token. */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    readonly accessTokenTtlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  signAccessToken({ userId, role }: AuthContext): Promise<string> {
    return new SignJWT({ role })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM],
      });
      const role = payload.role;
      if (typeof payload.sub !== 'string' || typeof role !== 'string' || !ROLES.has(role)) {
        throw AppError.unauthorized('Token inválido.', 'INVALID_TOKEN');
      }
      return { userId: payload.sub, role: role as Role };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof errors.JWTExpired) {
        // Código próprio para o app saber que deve renovar a sessão, e não pedir login.
        throw AppError.unauthorized('Sessão expirada.', 'TOKEN_EXPIRED');
      }
      throw AppError.unauthorized('Token inválido.', 'INVALID_TOKEN');
    }
  }
}

/** Token opaco de 256 bits, seguro para URL. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 em hex. Suficiente para token aleatório de 256 bits (não serve para senha). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
