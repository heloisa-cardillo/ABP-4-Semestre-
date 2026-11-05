import { describe, expect, it } from 'vitest';
import { AuthorizationStatus } from '../../src/generated/prisma/enums.js';
import { situationOf } from '../../src/services/authorization-rules.js';

const TODAY = '2026-11-10';

const base = {
  status: AuthorizationStatus.ACTIVE,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  maxUses: null as number | null,
  usesCount: 0,
};

describe('situationOf', () => {
  it('VALID: ativa, dentro do período e com usos disponíveis', () => {
    expect(situationOf(base, TODAY)).toBe('VALID');
    expect(situationOf({ ...base, maxUses: 3, usesCount: 2 }, TODAY)).toBe('VALID');
  });

  it('o primeiro e o último dia do período contam como válidos', () => {
    expect(situationOf({ ...base, startDate: TODAY }, TODAY)).toBe('VALID');
    expect(situationOf({ ...base, endDate: TODAY }, TODAY)).toBe('VALID');
  });

  it('SCHEDULED: começa depois de hoje', () => {
    expect(situationOf({ ...base, startDate: '2026-11-11' }, TODAY)).toBe('SCHEDULED');
  });

  it('EXPIRED: terminou antes de hoje', () => {
    expect(situationOf({ ...base, endDate: '2026-11-09' }, TODAY)).toBe('EXPIRED');
  });

  it('EXHAUSTED: usou todas as vezes permitidas', () => {
    expect(situationOf({ ...base, maxUses: 1, usesCount: 1 }, TODAY)).toBe('EXHAUSTED');
  });

  it('CANCELLED vence qualquer outra situação', () => {
    const cancelled = { ...base, status: AuthorizationStatus.CANCELLED };
    expect(situationOf(cancelled, TODAY)).toBe('CANCELLED');
    expect(situationOf({ ...cancelled, endDate: '2026-11-01' }, TODAY)).toBe('CANCELLED');
  });

  it('EXPIRED vence EXHAUSTED: o que importa para a pessoa é que acabou o prazo', () => {
    expect(situationOf({ ...base, endDate: '2026-11-09', maxUses: 1, usesCount: 1 }, TODAY)).toBe(
      'EXPIRED',
    );
  });
});
