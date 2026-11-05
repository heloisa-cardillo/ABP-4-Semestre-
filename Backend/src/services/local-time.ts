/**
 * Datas e horários no fuso do edifício.
 *
 * Autorizações guardam data (`date`) e janela diária (`time`) no horário local do edifício,
 * mas o servidor pode rodar em UTC. Tudo que compara "hoje" ou "agora" passa por aqui.
 * Datas circulam como texto `YYYY-MM-DD` e horários como `HH:mm:ss`: comparação de texto
 * nesse formato equivale à comparação cronológica.
 */

/** Data no formato `YYYY-MM-DD`. */
export type DateOnly = string;
/** Horário no formato `HH:mm:ss`. */
export type TimeOfDay = string;

/** Fonte de "hoje" injetável, para os testes controlarem a data. */
export interface Clock {
  now(): Date;
  today(): DateOnly;
}

export function systemClock(timeZone: string): Clock {
  return {
    now: () => new Date(),
    today: () => localDate(new Date(), timeZone),
  };
}

function parts(now: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
}

/** Data local (`YYYY-MM-DD`) do instante `now` no fuso informado. */
export function localDate(now: Date, timeZone: string): DateOnly {
  const p = parts(now, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Horário local (`HH:mm:ss`) do instante `now` no fuso informado. */
export function localTime(now: Date, timeZone: string): TimeOfDay {
  const p = parts(now, timeZone);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** Soma (ou subtrai, com valor negativo) dias a uma data `YYYY-MM-DD`. */
export function addDays(date: DateOnly, days: number): DateOnly {
  const d = dateToDb(date);
  d.setUTCDate(d.getUTCDate() + days);
  return dateFromDb(d);
}

/** O Prisma representa coluna `date` como `Date` à meia-noite UTC. */
export function dateToDb(date: DateOnly): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dateFromDb(value: Date): DateOnly {
  return value.toISOString().slice(0, 10);
}

/** O Prisma representa coluna `time` como `Date` em 1970-01-01 UTC. Aceita `HH:mm` ou `HH:mm:ss`. */
export function timeToDb(time: string): Date {
  const full = time.length === 5 ? `${time}:00` : time;
  return new Date(`1970-01-01T${full}.000Z`);
}

export function timeFromDb(value: Date): TimeOfDay {
  return value.toISOString().slice(11, 19);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
