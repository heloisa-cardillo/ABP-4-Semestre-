import type { Logger } from 'pino';
import { AccessMethod } from '../generated/prisma/enums.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { AccessAttempt, AccessDecider, AccessDecision } from './access-decision.js';
import type { TurnstileNotifier } from './turnstile-notifier.js';

/**
 * Porta de entrada das tentativas de acesso, usada pelas rotas de NFC e de QR:
 * decide (o serviço de decisão grava o evento) e depois avisa a catraca.
 *
 * Também é um `AccessDecider`: a rota do QR recebe esta classe e ganha o aviso à catraca
 * sem mudar nada no código dela.
 */
export class AccessService implements AccessDecider {
  constructor(
    private readonly decider: AccessDecider,
    private readonly users: UserRepository,
    private readonly notifier: TurnstileNotifier,
    private readonly logger: Logger,
  ) {}

  /** Decide, grava o evento e avisa o terminal da catraca. */
  async decide(attempt: AccessAttempt): Promise<AccessDecision> {
    const decision = await this.decider.decide(attempt);
    // Sem terminal conhecido (ex.: QR forjado) não há catraca para avisar.
    if (attempt.terminalId) await this.notifyTurnstile(attempt.terminalId, decision);
    return decision;
  }

  /** O terminal leu uma tag NFC. Tag que não é de ninguém vira `UNKNOWN_USER`. */
  async nfc(terminalId: string, uid: string): Promise<AccessDecision> {
    const user = await this.users.findByNfcUid(uid);
    return this.decide({
      method: AccessMethod.NFC,
      terminalId,
      userId: user?.id ?? null,
      credential: uid,
    });
  }

  /**
   * O evento já está gravado quando chega aqui. Se o broker falhar, só registra no log:
   * a requisição não pode cair por causa do aviso.
   */
  private async notifyTurnstile(terminalId: string, decision: AccessDecision): Promise<void> {
    try {
      await this.notifier.notify(terminalId, decision);
    } catch (err) {
      this.logger.error(
        { err, terminalId, eventId: decision.eventId },
        'falha ao avisar a catraca da decisão de acesso',
      );
    }
  }
}
