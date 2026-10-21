import type { RequestHandler } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import type { TokenService } from '../services/token.service.js';
import { AppError } from '../shared/app-error.js';

const BEARER = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/;

/** Exige um JWT de acesso válido e guarda o usuário em `res.locals.auth`. */
export function authenticate(tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw AppError.unauthorized();
    res.locals.auth = await tokens.verifyAccessToken(token);
    next();
  };
}

/** Exige um dos perfis informados. Usar depois de `authenticate`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const { auth } = res.locals;
    if (!auth) throw AppError.unauthorized();
    if (!roles.includes(auth.role)) throw AppError.forbidden();
    next();
  };
}
