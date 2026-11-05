import type { Response } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { AppError } from './app-error.js';

/** Quem está fazendo a requisição, extraído do JWT de acesso já verificado. */
export interface AuthContext {
  userId: string;
  role: Role;
}

/** Terminal de acesso autenticado pela credencial do dispositivo. */
export interface TerminalContext {
  terminalId: string;
  locationId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- forma oficial de tipar res.locals no Express
  namespace Express {
    interface Locals {
      auth?: AuthContext;
      terminal?: TerminalContext;
    }
  }
}

/** Lê o usuário autenticado. Só chamar em rota protegida por `authenticate`. */
export function getAuth(res: Response): AuthContext {
  const { auth } = res.locals;
  if (!auth) throw AppError.unauthorized();
  return auth;
}

/** Lê o terminal autenticado. Só chamar em rota protegida por `authenticateTerminal`. */
export function getTerminal(res: Response): TerminalContext {
  const { terminal } = res.locals;
  if (!terminal) throw AppError.unauthorized();
  return terminal;
}
