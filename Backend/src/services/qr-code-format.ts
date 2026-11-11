import { randomBytes } from 'node:crypto';

/**
 * Formato do conteúdo do QR Code exibido pelo terminal: `<id>.<segredo>`, os dois em base64url.
 *
 * - `id`: o UUID do desafio (16 bytes) em base64url, 22 caracteres.
 * - `segredo`: 128 bits aleatórios em base64url, 22 caracteres. O banco guarda só o SHA-256.
 *
 * Total de 45 caracteres. Até 53 o QR fica na versão 3 (29x29 módulos), que no OLED de
 * 128x64 do terminal sai com 2 pixels por módulo e é lido pela câmera do celular. O formato
 * anterior (UUID por extenso + segredo de 256 bits, 80 caracteres) virava versão 5 e saía
 * com 1 pixel por módulo. Como o código vale 10 segundos e uma vez só, 128 bits sobram.
 */
export const QR_CODE_PATTERN = /^[\w-]{22}\.[\w-]{22}$/;

/** Limite para o QR caber na versão 3 com correção de erro baixa (modo byte). */
export const QR_CODE_MAX_LENGTH = 53;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Segredo novo do QR: 16 bytes aleatórios em base64url (22 caracteres). */
export function generateQrSecret(): string {
  return randomBytes(16).toString('base64url');
}

/** Monta o conteúdo do QR a partir do UUID do desafio e do segredo. */
export function formatQrCode(id: string, secret: string): string {
  if (!UUID_PATTERN.test(id)) throw new Error('O id do desafio precisa ser um UUID.');
  const shortId = Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url');
  return `${shortId}.${secret}`;
}

/**
 * Lê o conteúdo do QR. Devolve o UUID do desafio (minúsculo, com hífens) e o segredo,
 * ou `null` se não estiver no formato. Só aceita a forma canônica do base64url, para
 * cada desafio ter um único texto válido.
 */
export function parseQrCode(code: string): { id: string; secret: string } | null {
  if (!QR_CODE_PATTERN.test(code)) return null;
  const [shortId, secret] = code.split('.') as [string, string];
  const bytes = Buffer.from(shortId, 'base64url');
  if (bytes.length !== 16 || bytes.toString('base64url') !== shortId) return null;
  const hex = bytes.toString('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { id, secret };
}
