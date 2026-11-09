import { Prisma } from '../generated/prisma/client.js';

/** Violação de unicidade (P2002), ex.: e-mail já cadastrado. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Registro alvo de update/delete não existe (P2025). */
export function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

/**
 * Violação de unicidade num campo específico. Sem driver adapter o Prisma informa os campos
 * em `meta.target`; com o adapter do pg vem o nome do índice (ex.: `users_nfc_uid_key`) em
 * `meta.driverAdapterError`. Procura o nome da coluna nos dois formatos.
 */
export function isUniqueViolationOn(err: unknown, ...columns: string[]): boolean {
  if (!isUniqueViolation(err)) return false;
  const meta = JSON.stringify((err as Prisma.PrismaClientKnownRequestError).meta ?? {});
  return columns.some((column) => meta.includes(column));
}
