import type { Logger } from 'pino';
import { connect, type MqttClient } from 'mqtt';
import type { AccessDecision } from '../services/access-decision.js';
import {
  decisionTopic,
  toTurnstileMessage,
  type TurnstileNotifier,
} from '../services/turnstile-notifier.js';

export interface MqttNotifierOptions {
  url: string;
  username?: string | undefined;
  password?: string | undefined;
  /** Quanto esperar a confirmação do broker (QoS 1) antes de desistir. */
  publishTimeoutMs?: number;
}

/**
 * Publica a decisão no broker MQTT, com QoS 1, no tópico `terminals/{terminalId}/decision`.
 * Sem conexão com o broker a publicação falha na hora em vez de ficar na fila: um aviso
 * atrasado não deve abrir a catraca (o firmware descarta mensagens com mais de 5 s).
 */
export class MqttTurnstileNotifier implements TurnstileNotifier {
  private readonly client: MqttClient;
  private readonly publishTimeoutMs: number;

  constructor(options: MqttNotifierOptions, logger: Logger) {
    this.publishTimeoutMs = options.publishTimeoutMs ?? 2000;
    this.client = connect(options.url, {
      ...(options.username !== undefined && { username: options.username }),
      ...(options.password !== undefined && { password: options.password }),
      clientId: `api-${process.pid}-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5000,
      connectTimeout: 5000,
    });
    this.client.on('connect', () => {
      logger.info({ url: options.url }, 'conectado ao broker MQTT');
    });
    this.client.on('error', (err) => {
      logger.warn({ err }, 'erro na conexão com o broker MQTT');
    });
  }

  isConnected(): boolean {
    return this.client.connected;
  }

  async notify(terminalId: string, decision: AccessDecision): Promise<void> {
    if (!this.isConnected()) throw new Error('Sem conexão com o broker MQTT.');
    const payload = JSON.stringify(toTurnstileMessage(decision, new Date()));

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('O broker MQTT não confirmou a publicação a tempo.'));
      }, this.publishTimeoutMs);
    });
    try {
      await Promise.race([
        this.client.publishAsync(decisionTopic(terminalId), payload, { qos: 1 }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    await this.client.endAsync();
  }
}
