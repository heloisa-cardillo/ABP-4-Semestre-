import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../shared/app-error.js';

type Part = 'body' | 'query' | 'params';

/**
 * Valida uma parte da requisição contra um schema Zod.
 * O resultado validado (com coerções e defaults) fica em `res.locals.<parte>`,
 * de modo que o controller nunca lê entrada crua.
 */
export function validate(part: Part, schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(
        AppError.badRequest(
          'VALIDATION_ERROR',
          'Dados inválidos.',
          result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    (res.locals as Record<Part, unknown>)[part] = result.data;
    next();
  };
}
