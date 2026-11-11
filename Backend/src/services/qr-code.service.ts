import { timingSafeEqual } from 'node:crypto';
import { AccessMethod, DenyReason } from '../generated/prisma/enums.js';
import type { RedeemQrInput } from '../models/qr.schemas.js';
import type { QrChallengeRepository } from '../repositories/qr-challenge.repository.js';
import type { AuthContext } from '../shared/auth-context.js';
import type { AccessDecider, AccessDecision } from './access-decision.js';
import type { Clock } from './local-time.js';
import { formatQrCode, generateQrSecret, parseQrCode } from './qr-code-format.js';
import { sha256 } from './token.service.js';

/** Códigos vencidos há mais que isso são apagados quando o terminal pede um novo. */
const CLEANUP_AFTER_MS = 60 * 60 * 1000;

export interface IssuedQrCode {
  /**
   * Conteúdo do QR Code, com 45 caracteres (veja `qr-code-format.ts`).
   * O segredo só existe aqui; o banco guarda o hash.
   */
  code: string;
  expiresAt: Date;
  ttlSeconds: number;
}

/**
 * QR Code rotativo (US7): o terminal pede um código novo a cada `ttlSeconds` e o exibe;
 * o app lê, envia junto com a posição do celular, e o backend decide.
 */
export class QrCodeService {
  constructor(
    private readonly challenges: QrChallengeRepository,
    private readonly decider: AccessDecider,
    private readonly clock: Clock,
    private readonly ttlSeconds: number,
  ) {}

  async issue(terminalId: string): Promise<IssuedQrCode> {
    const now = this.clock.now();
    const secret = generateQrSecret();
    const challenge = await this.challenges.create({
      terminalId,
      secretHash: sha256(secret),
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
    });
    await this.challenges.deleteExpired(terminalId, new Date(now.getTime() - CLEANUP_AFTER_MS));
    return {
      code: formatQrCode(challenge.id, secret),
      expiresAt: challenge.expiresAt,
      ttlSeconds: this.ttlSeconds,
    };
  }

  /**
   * Toda leitura vira uma tentativa registrada pelo serviço de decisão, inclusive as inválidas.
   * Aqui só se confere o código; quem pode entrar onde é regra do serviço de decisão.
   */
  async redeem(actor: AuthContext, input: RedeemQrInput): Promise<AccessDecision> {
    // A rota já validou o formato (redeemQrSchema); aqui ele sempre é lido.
    const parsed = parseQrCode(input.code);
    if (!parsed) throw new Error('Código de QR fora do formato chegou ao serviço.');
    const { id, secret } = parsed;
    const position = { latitude: input.latitude, longitude: input.longitude };
    const attempt = { method: AccessMethod.QR, userId: actor.userId, credential: id, position };

    const challenge = await this.challenges.findById(id);
    const expected = Buffer.from(challenge?.secretHash ?? '0'.repeat(64), 'hex');
    // Comparação em tempo constante, feita mesmo quando o código não existe.
    const matches = timingSafeEqual(expected, Buffer.from(sha256(secret), 'hex'));
    if (!challenge || !matches) {
      // Sem o segredo certo não dá para afirmar de qual terminal veio: não atribui a nenhum.
      return this.decider.decide({
        ...attempt,
        terminalId: null,
        presetDeny: DenyReason.INVALID_CREDENTIAL,
      });
    }

    const now = this.clock.now();
    if (await this.challenges.consume(id, now)) {
      return this.decider.decide({ ...attempt, terminalId: challenge.terminalId });
    }
    return this.decider.decide({
      ...attempt,
      terminalId: challenge.terminalId,
      presetDeny:
        challenge.expiresAt <= now
          ? DenyReason.EXPIRED_CREDENTIAL
          : DenyReason.CREDENTIAL_ALREADY_USED,
    });
  }
}
