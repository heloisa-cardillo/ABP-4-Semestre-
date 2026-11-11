import { randomBytes } from 'node:crypto';

/**
 * Formato do conteúdo do QR Code exibido pelo terminal: 25 caracteres de um alfabeto de 32
 * símbolos (Crockford base32: dígitos e letras maiúsculas, sem I, L, O e U), ou seja,
 * 125 bits aleatórios. O código É o segredo: o banco guarda só o SHA-256 dele e acha o
 * desafio por esse hash.
 *
 * Por que assim: só maiúsculas e dígitos cabem no modo alfanumérico do QR Code, e 25
 * caracteres é o máximo da versão 1 (21x21 módulos). Com 2 pixels por módulo o QR tem 42 px
 * e cabe inteiro nas 48 linhas azuis do OLED bicolor de 128x64 do terminal, longe da faixa
 * entre o amarelo e o azul que impedia a leitura. 125 bits sobram para um código que vale
 * 10 segundos e uma vez só.
 */
export const QR_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const QR_CODE_LENGTH = 25;
export const QR_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{25}$/;

/** Código novo: 125 bits aleatórios, 5 por caractere. */
export function generateQrCode(): string {
  // 16 bytes = 128 bits; usamos os 125 primeiros.
  let bits = BigInt(`0x${randomBytes(16).toString('hex')}`) >> 3n;
  let code = '';
  for (let i = 0; i < QR_CODE_LENGTH; i += 1) {
    code = QR_CODE_ALPHABET.charAt(Number(bits & 31n)) + code;
    bits >>= 5n;
  }
  return code;
}

/** Confere se o texto lido tem o formato de um código de terminal. */
export function isQrCode(code: string): boolean {
  return QR_CODE_PATTERN.test(code);
}
