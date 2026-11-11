import { describe, expect, it } from 'vitest';
import {
  generateQrCode,
  isQrCode,
  QR_CODE_ALPHABET,
  QR_CODE_LENGTH,
  QR_CODE_PATTERN,
} from '../../src/services/qr-code-format.js';

/** Caracteres do modo alfanumérico do QR Code (ISO/IEC 18004). */
const QR_ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;

describe('formato do QR Code', () => {
  it('tem 25 caracteres: o máximo de um QR versão 1 (21x21) no modo alfanumérico', () => {
    const code = generateQrCode();
    expect(code).toHaveLength(QR_CODE_LENGTH);
    expect(QR_CODE_LENGTH).toBe(25);
    expect(code).toMatch(QR_CODE_PATTERN);
  });

  it('usa só caracteres do modo alfanumérico do QR (maiúsculas e dígitos)', () => {
    for (let i = 0; i < 200; i += 1) expect(generateQrCode()).toMatch(QR_ALPHANUMERIC);
    expect(QR_CODE_ALPHABET).toMatch(QR_ALPHANUMERIC);
  });

  it('alfabeto de 32 símbolos, sem I, L, O e U (não se confundem com 1, 0 e V)', () => {
    expect(new Set(QR_CODE_ALPHABET).size).toBe(32);
    expect(QR_CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });

  it('cada código é aleatório e diferente', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateQrCode()));
    expect(codes.size).toBe(1000);
  });

  it('usa todo o alfabeto (125 bits aleatórios, 5 por caractere)', () => {
    const seen = new Set(Array.from({ length: 400 }, () => generateQrCode()).join(''));
    expect(seen.size).toBe(32);
  });

  it.each([
    ['vazio', ''],
    ['curto demais', 'A'.repeat(24)],
    ['longo demais', 'A'.repeat(26)],
    ['minúsculas', 'a'.repeat(25)],
    ['letra fora do alfabeto (O)', 'O'.repeat(25)],
    ['URL qualquer', 'https://exemplo.com'],
    ['formato antigo (id.segredo)', `${'A'.repeat(22)}.${'b'.repeat(22)}`],
  ])('recusa código inválido: %s', (_nome, code) => {
    expect(isQrCode(code)).toBe(false);
  });

  it('aceita um código gerado', () => {
    expect(isQrCode(generateQrCode())).toBe(true);
  });
});
