import { describe, expect, it } from 'vitest';
import {
  formatQrCode,
  generateQrSecret,
  parseQrCode,
  QR_CODE_MAX_LENGTH,
  QR_CODE_PATTERN,
} from '../../src/services/qr-code-format.js';

const ID = '01a1cc14-3bc5-7467-b84b-a93e46e39538';

describe('formato curto do QR Code', () => {
  it('cabe num QR versão 3 (até 53 caracteres), legível no OLED de 128x64', () => {
    const code = formatQrCode(ID, generateQrSecret());
    expect(code).toHaveLength(45);
    expect(code.length).toBeLessThanOrEqual(QR_CODE_MAX_LENGTH);
    expect(code).toMatch(QR_CODE_PATTERN);
  });

  it('o segredo tem 128 bits aleatórios e muda a cada chamada', () => {
    const a = generateQrSecret();
    const b = generateQrSecret();
    expect(Buffer.from(a, 'base64url')).toHaveLength(16);
    expect(a).not.toBe(b);
  });

  it('ida e volta: devolve o mesmo id (UUID) e o mesmo segredo', () => {
    const secret = generateQrSecret();
    expect(parseQrCode(formatQrCode(ID, secret))).toEqual({ id: ID, secret });
  });

  it('id em maiúsculas é normalizado para minúsculas', () => {
    const secret = generateQrSecret();
    expect(parseQrCode(formatQrCode(ID.toUpperCase(), secret))?.id).toBe(ID);
  });

  it.each([
    ['vazio', ''],
    ['sem o ponto', 'a'.repeat(45)],
    ['URL qualquer', 'https://exemplo.com'],
    ['formato antigo (UUID + segredo de 43)', `${ID}.${'a'.repeat(43)}`],
    ['caractere fora do base64url', `${'a'.repeat(21)}+.${'a'.repeat(22)}`],
    ['id não canônico (bits de sobra no último caractere)', `${'A'.repeat(21)}B.${'a'.repeat(22)}`],
  ])('recusa código inválido: %s', (_nome, code) => {
    expect(parseQrCode(code)).toBeNull();
  });

  it('recusa id que não é UUID ao montar o código', () => {
    expect(() => formatQrCode('nao-e-uuid', generateQrSecret())).toThrow();
  });
});
