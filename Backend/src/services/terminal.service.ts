import { timingSafeEqual } from 'node:crypto';
import type { Location, Prisma, Terminal } from '../generated/prisma/client.js';
import { LocationType } from '../generated/prisma/enums.js';
import type {
  CreateTerminalInput,
  ListTerminalsQuery,
  UpdateTerminalInput,
} from '../models/terminal.schemas.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import { isRecordNotFound, isUniqueViolation } from '../repositories/prisma-errors.js';
import type { TerminalRepository } from '../repositories/terminal.repository.js';
import { AppError } from '../shared/app-error.js';
import { generateOpaqueToken, sha256 } from './token.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const terminalNotFound = () => AppError.notFound('Terminal não encontrado.');
const invalidCredential = () =>
  AppError.unauthorized('Credencial do terminal inválida.', 'INVALID_TERMINAL_CREDENTIAL');

export interface TerminalWithCredential {
  terminal: Terminal;
  /** `<id>.<segredo>`: só existe neste retorno; o banco guarda apenas o hash do segredo. */
  credential: string;
}

/** Cadastro de terminais de acesso e autenticação do dispositivo (RF11). */
export class TerminalService {
  constructor(
    private readonly terminals: TerminalRepository,
    private readonly locations: LocationRepository,
  ) {}

  async create(input: CreateTerminalInput): Promise<TerminalWithCredential> {
    await this.assertInstallableAt(input.locationId);
    const secret = generateOpaqueToken();
    try {
      const terminal = await this.terminals.create({
        name: input.name,
        locationId: input.locationId,
        secretHash: sha256(secret),
      });
      return { terminal, credential: `${terminal.id}.${secret}` };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw AppError.conflict('TURNSTILE_HAS_TERMINAL', 'Esta catraca já tem um terminal.');
      }
      throw err;
    }
  }

  list(query: ListTerminalsQuery) {
    return this.terminals.list(
      { active: query.active },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  async get(id: string): Promise<Terminal> {
    const terminal = await this.terminals.findById(id);
    if (!terminal) throw terminalNotFound();
    return terminal;
  }

  async getWithLocation(id: string): Promise<Terminal & { location: Location }> {
    const terminal = await this.terminals.findByIdWithLocation(id);
    if (!terminal) throw terminalNotFound();
    return terminal;
  }

  async update(id: string, input: UpdateTerminalInput): Promise<Terminal> {
    const current = await this.get(id);
    if (input.active === true && !current.active) {
      await this.assertInstallableAt(current.locationId);
    }

    const data: Prisma.TerminalUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.active !== undefined) data.active = input.active;
    return this.save(id, data);
  }

  async deactivate(id: string): Promise<void> {
    await this.get(id);
    await this.save(id, { active: false });
  }

  /** Gera um segredo novo. O anterior deixa de valer na hora (ex.: terminal extraviado). */
  async rotateCredential(id: string): Promise<TerminalWithCredential> {
    await this.get(id);
    const secret = generateOpaqueToken();
    const terminal = await this.save(id, { secretHash: sha256(secret) });
    return { terminal, credential: `${terminal.id}.${secret}` };
  }

  /** Confere a credencial `<id>.<segredo>` do dispositivo e registra que ele foi visto agora. */
  async authenticate(credential: string): Promise<Terminal & { location: Location }> {
    const separator = credential.indexOf('.');
    const id = credential.slice(0, separator);
    const secret = credential.slice(separator + 1);
    if (separator < 0 || !UUID.test(id) || !secret) throw invalidCredential();

    const terminal = await this.terminals.findByIdWithLocation(id);
    const expected = Buffer.from(terminal?.secretHash ?? '0'.repeat(64), 'hex');
    const received = Buffer.from(sha256(secret), 'hex');
    // Comparação em tempo constante, feita mesmo quando o terminal não existe.
    const matches = timingSafeEqual(expected, received);
    if (!terminal || !matches || !terminal.active) throw invalidCredential();

    await this.terminals.touch(terminal.id);
    return terminal;
  }

  private async assertInstallableAt(locationId: string): Promise<void> {
    const location = await this.locations.findById(locationId);
    if (!location) {
      throw AppError.unprocessable('LOCATION_NOT_FOUND', 'O local informado não existe.');
    }
    if (location.type !== LocationType.TURNSTILE) {
      throw AppError.unprocessable('NOT_A_TURNSTILE', 'O terminal precisa ficar numa catraca.');
    }
    if (!location.active) {
      throw AppError.unprocessable('LOCATION_INACTIVE', 'A catraca está desativada.');
    }
  }

  private async save(id: string, data: Prisma.TerminalUpdateInput): Promise<Terminal> {
    try {
      return await this.terminals.update(id, data);
    } catch (err) {
      if (isRecordNotFound(err)) throw terminalNotFound();
      throw err;
    }
  }
}
