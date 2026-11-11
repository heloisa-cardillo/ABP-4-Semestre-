import { AccessMethod, DenyReason } from '../generated/prisma/enums.js';
import type { RedeemQrInput } from '../models/qr.schemas.js';
import type { QrChallengeRepository } from '../repositories/qr-challenge.repository.js';
import type { AuthContext } from '../shared/auth-context.js';
import type { AccessDecider, AccessDecision } from './access-decision.js';
import type { Clock } from './local-time.js';
import { generateQrCode } from './qr-code-format.js';
import { sha256 } from './token.service.js';

/** Códigos vencidos há mais que isso são apagados quando o terminal pede um novo. */
const CLEANUP_AFTER_MS = 60 * 60 * 1000;

export interface IssuedQrCode {
  /**
   * Conteúdo do QR Code: 25 caracteres alfanuméricos (veja `qr-code-format.ts`).
   * É o próprio segredo e só existe aqui; o banco guarda o hash.
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
    const code = generateQrCode();
    const challenge = await this.challenges.create({
      terminalId,
      secretHash: sha256(code),
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
    });
    await this.challenges.deleteExpired(terminalId, new Date(now.getTime() - CLEANUP_AFTER_MS));
    return {
      code,
      expiresAt: challenge.expiresAt,
      ttlSeconds: this.ttlSeconds,
    };
  }

  /**
   * Toda leitura vira uma tentativa registrada pelo serviço de decisão, inclusive as inválidas.
   * Aqui só se confere o código; quem pode entrar onde é regra do serviço de decisão.
   */
  async redeem(actor: AuthContext, input: RedeemQrInput): Promise<AccessDecision> {
    const position = { latitude: input.latitude, longitude: input.longitude };
    const base = { method: AccessMethod.QR, userId: actor.userId, position };
    // O código é o próprio segredo: o desafio é achado pelo hash, nunca pelo texto.
    const secretHash = sha256(input.code);

    const challenge = await this.challenges.findBySecretHash(secretHash);
    if (!challenge) {
      // Código que nenhum terminal gerou: não se sabe de qual catraca veio. O registro guarda
      // só um pedaço do hash, que permite ver repetições sem guardar o texto lido.
      return this.decider.decide({
        ...base,
        credential: `sha256:${secretHash.slice(0, 16)}`,
        terminalId: null,
        presetDeny: DenyReason.INVALID_CREDENTIAL,
      });
    }

    const attempt = { ...base, credential: challenge.id };
    const now = this.clock.now();
    if (await this.challenges.consume(challenge.id, now)) {
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
