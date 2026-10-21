import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from '../shared/app-error.js';

/**
 * Limita tentativas de login por IP + e-mail numa janela de 15 minutos (força bruta).
 * A chave inclui o e-mail para que várias pessoas atrás do mesmo IP (Wi-Fi da faculdade,
 * do prédio) não bloqueiem umas às outras.
 */
export function loginRateLimit(max: number): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const body: unknown = req.body;
      const email =
        typeof body === 'object' &&
        body !== null &&
        'email' in body &&
        typeof body.email === 'string'
          ? body.email.trim().toLowerCase()
          : '';
      return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
    },
    handler: (_req, _res, next) => {
      next(new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde alguns minutos.'));
    },
  });
}
