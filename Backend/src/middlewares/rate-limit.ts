import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from '../shared/app-error.js';

const WINDOW_MS = 15 * 60 * 1000;

function limiter(max: number, keyGenerator: (req: Request) => string): RequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde alguns minutos.'));
    },
  });
}

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? '');

/**
 * Limita tentativas de login por IP + e-mail numa janela de 15 minutos (força bruta).
 * A chave inclui o e-mail para que várias pessoas atrás do mesmo IP (Wi-Fi da faculdade,
 * do prédio) não bloqueiem umas às outras.
 */
export function loginRateLimit(max: number): RequestHandler {
  return limiter(max, (req) => {
    const body: unknown = req.body;
    const email =
      typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';
    return `${clientIp(req)}|${email}`;
  });
}

/**
 * Limita renovação e encerramento de sessão por IP numa janela de 15 minutos.
 * O refresh token tem 256 bits e não se adivinha; o limite protege o banco de excesso de chamadas.
 */
export function sessionRateLimit(max: number): RequestHandler {
  return limiter(max, clientIp);
}
