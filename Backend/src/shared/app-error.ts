/**
 * Erro de negócio com status HTTP e código estável.
 * O `code` é o contrato com o app e o terminal; a `message` é para gente ler.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(code: string, message: string, details?: unknown): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Autenticação necessária.', code = 'UNAUTHORIZED'): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'Você não tem permissão para esta ação.'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Recurso não encontrado.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }

  /** Entrada bem formada que fere uma regra de negócio (ex.: catraca fora de uma porta). */
  static unprocessable(code: string, message: string): AppError {
    return new AppError(422, code, message);
  }
}
