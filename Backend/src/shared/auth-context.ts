import type { Response } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { AppError } from './app-error.js';

/** Quem está fazendo a requisição, extraído do JWT de acesso já verificado. */
export interface AuthContext {
  userId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- forma oficial de tipar res.locals no Express
  namespace Express {
    interface Locals {
      auth?: AuthContext;
    }
  }
}

/** Lê o usuário autenticado. Só chamar em rota protegida por `authenticate`. */
export function getAuth(res: Response): AuthContext {
  const { auth } = res.locals;
  if (!auth) throw AppError.unauthorized();
  return auth;
}
