import type {
  AccessEventDetails,
  ListAccessEventsQuery,
  ListMyAccessEventsQuery,
} from '../models/access-event.schemas.js';
import type { AccessEventFilter } from '../repositories/access-event.repository.js';
import type { PageRequest } from '../repositories/user.repository.js';
import type { AuthContext } from '../shared/auth-context.js';
import { addDays, localDayStart, type DateOnly } from './local-time.js';

/** O que o serviço precisa do repositório de eventos. */
export interface AccessEventReader {
  list(
    filter: AccessEventFilter,
    page: PageRequest,
  ): Promise<{ items: AccessEventDetails[]; total: number }>;
}

/** O que o serviço precisa do repositório de locais. */
export interface LocationTreeReader {
  findDescendantIds(locationId: string): Promise<string[]>;
}

/**
 * Consulta do histórico de tentativas de acesso (US10).
 * Só lê: o histórico é imutável e é gravado pelo motor de decisão de acesso.
 */
export class AccessHistoryService {
  constructor(
    private readonly events: AccessEventReader,
    private readonly locations: LocationTreeReader,
    private readonly timeZone: string,
  ) {}

  /** Histórico completo, para o administrador. O filtro de local inclui tudo abaixo dele. */
  async list(query: ListAccessEventsQuery) {
    const locationIds = query.locationId
      ? await this.locations.findDescendantIds(query.locationId)
      : undefined;
    return this.events.list(
      {
        userId: query.userId,
        locationIds,
        terminalId: query.terminalId,
        method: query.method,
        result: query.result,
        ...this.period(query.from, query.to),
      },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  /** Só as tentativas da pessoa logada. */
  listMine(actor: AuthContext, query: ListMyAccessEventsQuery) {
    return this.events.list(
      {
        userId: actor.userId,
        method: query.method,
        result: query.result,
        ...this.period(query.from, query.to),
      },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  /** Dias do calendário do edifício → intervalo [since, until) em instantes. `to` é inclusive. */
  private period(from: DateOnly | undefined, to: DateOnly | undefined) {
    return {
      since: from ? localDayStart(from, this.timeZone) : undefined,
      until: to ? localDayStart(addDays(to, 1), this.timeZone) : undefined,
    };
  }
}
