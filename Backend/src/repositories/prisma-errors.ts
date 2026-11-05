import { Prisma } from '../generated/prisma/client.js';

/** Violação de unicidade (P2002), ex.: e-mail já cadastrado. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Registro alvo de update/delete não existe (P2025). */
export function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}
