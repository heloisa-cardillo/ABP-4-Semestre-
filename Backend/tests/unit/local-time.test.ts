import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateFromDb,
  dateToDb,
  isValidTimeZone,
  localDate,
  localTime,
  systemClock,
  timeFromDb,
  timeToDb,
} from '../../src/services/local-time.js';

const SP = 'America/Sao_Paulo';

describe('localDate e localTime', () => {
  it('converte o instante UTC para a data e a hora do edifício', () => {
    const now = new Date('2026-11-10T15:30:45Z'); // 12:30:45 em São Paulo (UTC-3)
    expect(localDate(now, SP)).toBe('2026-11-10');
    expect(localTime(now, SP)).toBe('12:30:45');
  });

  it('23h30 em São Paulo já é o dia seguinte em UTC, mas a data local continua sendo hoje', () => {
    const now = new Date('2026-11-11T02:30:00Z');
    expect(now.toISOString().slice(0, 10)).toBe('2026-11-11');
    expect(localDate(now, SP)).toBe('2026-11-10');
    expect(localTime(now, SP)).toBe('23:30:00');
  });

  it('meia-noite local sai como 00:00:00, não 24:00:00', () => {
    expect(localTime(new Date('2026-11-10T03:00:00Z'), SP)).toBe('00:00:00');
  });
});

describe('addDays', () => {
  it('soma e subtrai dias atravessando mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-11-10', 0)).toBe('2026-11-10');
  });
});

describe('conversão de e para as colunas date e time do banco', () => {
  it('data vai e volta sem deslocamento de fuso', () => {
    const db = dateToDb('2026-11-10');
    expect(db.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(dateFromDb(db)).toBe('2026-11-10');
  });

  it('horário vai e volta e aceita HH:mm ou HH:mm:ss', () => {
    expect(timeToDb('08:15').toISOString()).toBe('1970-01-01T08:15:00.000Z');
    expect(timeFromDb(timeToDb('18:00:30'))).toBe('18:00:30');
  });
});

describe('isValidTimeZone', () => {
  it('aceita fuso IANA e recusa nome inventado', () => {
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/Jacarei')).toBe(false);
  });
});

describe('systemClock', () => {
  it('devolve a data de hoje no fuso informado', () => {
    const clock = systemClock(SP);
    expect(clock.today()).toBe(localDate(new Date(), SP));
  });
});
