import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../shared/app-error.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Rota ${req.method} ${req.path} não existe.`));
};

/**
 * Ponto único de tradução de erro para resposta HTTP.
 * Erro inesperado vira 500 genérico: o detalhe vai para o log, nunca para o cliente.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    });
    return;
  }

  if (isBodyParserError(err)) {
    res.status(err.status).json({
      error: { code: 'INVALID_BODY', message: 'Corpo da requisição inválido.' },
    });
    return;
  }

  req.log.error({ err }, 'erro não tratado');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' },
  });
};

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}
