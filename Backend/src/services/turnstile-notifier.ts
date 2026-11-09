import type { AccessDecision } from './access-decision.js';

/**
 * Avisa o terminal da catraca sobre uma decisão de acesso (US7, US8).
 * No QR quem chama a API é o celular, então o terminal só fica sabendo por aqui.
 */
export interface TurnstileNotifier {
  notify(terminalId: string, decision: AccessDecision): Promise<void>;
  /** Fecha a conexão no encerramento da API. */
  close(): Promise<void>;
}

/** Usado quando não há broker configurado (`MQTT_URL` vazio) e nos testes. */
export class NoopTurnstileNotifier implements TurnstileNotifier {
  async notify(): Promise<void> {}
  async close(): Promise<void> {}
}

/** Tópico em que o terminal escuta as decisões da catraca dele. */
export function decisionTopic(terminalId: string): string {
  return `terminals/${terminalId}/decision`;
}

/** Mensagem publicada para o terminal. `ts` permite descartar aviso atrasado (mais de 5 s). */
export interface TurnstileMessage {
  result: AccessDecision['result'];
  message: string;
  eventId: string;
  ts: string;
}

export function toTurnstileMessage(decision: AccessDecision, now: Date): TurnstileMessage {
  return {
    result: decision.result,
    message: decision.message,
    eventId: decision.eventId,
    ts: now.toISOString(),
  };
}
