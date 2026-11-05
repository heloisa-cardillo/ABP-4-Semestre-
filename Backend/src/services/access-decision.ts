import type { AccessMethod, AccessResult, DenyReason } from '../generated/prisma/enums.js';
import { AppError } from '../shared/app-error.js';

/**
 * Contrato entre quem recebe a tentativa de acesso (rota do QR, rota do NFC)
 * e o serviço que aplica as regras e registra o evento.
 *
 * A implementação (`AccessDecisionService`) é a tarefa T2 do Dev 2. Ver
 * ABP-Backend-Tarefas-Dev2.md, seção 5. Mudanças aqui precisam ser combinadas entre os dois.
 */
export interface AccessAttempt {
  method: AccessMethod;
  /** Terminal da catraca. Nulo só quando a credencial não permite saber qual (ex.: QR forjado). */
  terminalId: string | null;
  /** Pessoa identificada: no QR vem do JWT, no NFC vem da tag. Nulo = ninguém identificado. */
  userId: string | null;
  /** Identificação da credencial, só para registro: UID da tag ou id do desafio do QR. Nunca o segredo. */
  credential: string;
  /** Só no QR: posição do celular no momento da leitura. */
  position?: { latitude: number; longitude: number };
  /** Negação já detectada por quem chama (ex.: QR expirado). O serviço só registra e nega. */
  presetDeny?: DenyReason;
}

export interface AccessDecision {
  result: AccessResult;
  denyReason: DenyReason | null;
  /** Texto curto, sem acento, para o display do terminal e para o app. */
  message: string;
  eventId: string;
  authorizationId: string | null;
  user: { id: string; name: string } | null;
  distanceMeters: number | null;
}

export interface AccessDecider {
  /** Aplica as regras, grava exatamente um AccessEvent e devolve a decisão. */
  decide(attempt: AccessAttempt): Promise<AccessDecision>;
}

/**
 * Usado enquanto o serviço de decisão do Dev 2 não estiver pronto: a rota responde 503
 * em vez de liberar ou negar sem aplicar as regras.
 */
export class UnavailableAccessDecider implements AccessDecider {
  decide(): Promise<AccessDecision> {
    return Promise.reject(
      new AppError(
        503,
        'ACCESS_DECISION_UNAVAILABLE',
        'A validação de acesso ainda não está disponível.',
      ),
    );
  }
}
