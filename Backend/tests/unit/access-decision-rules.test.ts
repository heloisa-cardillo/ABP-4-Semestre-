import { describe, expect, it } from 'vitest';
import { AuthorizationStatus, DenyReason } from '../../src/generated/prisma/enums.js';
import { ACCESS_MESSAGES, failedCheck } from '../../src/services/access-decision.service.js';
import { dateToDb, timeToDb } from '../../src/services/local-time.js';
import { decisionTopic, toTurnstileMessage } from '../../src/services/turnstile-notifier.js';

describe('mensagens de acesso', () => {
  it('há mensagem para a liberação e para cada motivo de negação', () => {
    for (const reason of [...Object.values(DenyReason), 'GRANTED' as const]) {
      expect(ACCESS_MESSAGES[reason]).toBeTruthy();
    }
  });

  it('cabem numa linha do display (16 caracteres) e não têm acento', () => {
    for (const message of Object.values(ACCESS_MESSAGES)) {
      expect(message.length).toBeLessThanOrEqual(16);
      expect(message).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe('failedCheck', () => {
  const base = {
    status: AuthorizationStatus.ACTIVE,
    startDate: dateToDb('2026-11-01'),
    endDate: dateToDb('2026-11-30'),
    startTime: timeToDb('08:00'),
    endTime: timeToDb('18:00'),
    maxUses: null,
    usesCount: 0,
  };

  it('autorização válida: null', () => {
    expect(failedCheck(base, '2026-11-10', '12:00:00')).toBeNull();
  });

  it('período e janela valem nas duas pontas', () => {
    expect(failedCheck(base, '2026-11-01', '08:00:00')).toBeNull();
    expect(failedCheck(base, '2026-11-30', '18:00:00')).toBeNull();
    expect(failedCheck(base, '2026-10-31', '12:00:00')).toBe(DenyReason.OUTSIDE_DATE_RANGE);
    expect(failedCheck(base, '2026-12-01', '12:00:00')).toBe(DenyReason.OUTSIDE_DATE_RANGE);
    expect(failedCheck(base, '2026-11-10', '07:59:59')).toBe(DenyReason.OUTSIDE_TIME_WINDOW);
    expect(failedCheck(base, '2026-11-10', '18:00:01')).toBe(DenyReason.OUTSIDE_TIME_WINDOW);
  });

  it('limite de usos', () => {
    expect(failedCheck({ ...base, maxUses: 3, usesCount: 2 }, '2026-11-10', '12:00:00')).toBeNull();
    expect(failedCheck({ ...base, maxUses: 3, usesCount: 3 }, '2026-11-10', '12:00:00')).toBe(
      DenyReason.USAGE_LIMIT_REACHED,
    );
  });

  it('segue a ordem da tabela: cancelada vem antes de período, horário e usos', () => {
    const everythingWrong = {
      ...base,
      status: AuthorizationStatus.CANCELLED,
      maxUses: 1,
      usesCount: 1,
    };
    expect(failedCheck(everythingWrong, '2027-01-01', '23:00:00')).toBe(
      DenyReason.AUTHORIZATION_CANCELLED,
    );
    expect(
      failedCheck(
        { ...everythingWrong, status: AuthorizationStatus.ACTIVE },
        '2027-01-01',
        '23:00:00',
      ),
    ).toBe(DenyReason.OUTSIDE_DATE_RANGE);
  });
});

describe('mensagem MQTT para a catraca', () => {
  it('tópico e payload combinados com o firmware', () => {
    expect(decisionTopic('abc')).toBe('terminals/abc/decision');
    const message = toTurnstileMessage(
      {
        result: 'GRANTED',
        denyReason: null,
        message: 'Acesso liberado',
        eventId: 'e1',
        authorizationId: 'a1',
        user: { id: 'u1', name: 'Ana Souza' },
        distanceMeters: 10,
      },
      new Date('2026-11-10T19:30:00Z'),
    );
    // Nada de dado pessoal no broker: só o necessário para abrir e mostrar a mensagem.
    expect(message).toEqual({
      result: 'GRANTED',
      message: 'Acesso liberado',
      eventId: 'e1',
      ts: '2026-11-10T19:30:00.000Z',
    });
  });
});
