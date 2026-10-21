import type { Location, Prisma } from '../generated/prisma/client.js';
import { LocationType } from '../generated/prisma/enums.js';
import type {
  CreateLocationInput,
  ListLocationsQuery,
  UpdateLocationInput,
} from '../models/location.schemas.js';
import { isRecordNotFound } from '../repositories/prisma-errors.js';
import type { LocationRepository } from '../repositories/location.repository.js';
import { AppError } from '../shared/app-error.js';
import { expectedParentType, LOCATION_LABEL, requiresCoordinates } from './location-rules.js';

const locationNotFound = () => AppError.notFound('Local não encontrado.');

/** Cadastro dos locais controlados: Edifício › Portaria › Porta › Catraca (RF02). */
export class LocationService {
  constructor(private readonly locations: LocationRepository) {}

  async create(input: CreateLocationInput): Promise<Location> {
    await this.assertValidParent(input.type, input.parentId);
    assertCoordinates(input.type, input.latitude ?? null);
    if (input.type === LocationType.BUILDING && !input.address) {
      throw AppError.unprocessable('ADDRESS_REQUIRED', 'Informe o endereço do edifício.');
    }

    return this.locations.create({
      type: input.type,
      name: input.name,
      description: input.description ?? null,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      parentId: input.parentId ?? null,
    });
  }

  list(query: ListLocationsQuery) {
    return this.locations.list(
      { type: query.type, parentId: query.parentId, active: query.active, search: query.search },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  async get(id: string): Promise<Location> {
    const location = await this.locations.findById(id);
    if (!location) throw locationNotFound();
    return location;
  }

  /** Tipo e local de cima não mudam: mover um ramo da árvore é outra operação, ainda não suportada. */
  async update(id: string, input: UpdateLocationInput): Promise<Location> {
    const current = await this.get(id);

    const latitude = input.latitude === undefined ? current.latitude : input.latitude;
    assertCoordinates(current.type, latitude);
    if (current.type === LocationType.BUILDING && input.address === null) {
      throw AppError.unprocessable('ADDRESS_REQUIRED', 'O edifício precisa de endereço.');
    }

    const data: Prisma.LocationUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.address !== undefined) data.address = input.address;
    if (input.latitude !== undefined) data.latitude = input.latitude;
    if (input.longitude !== undefined) data.longitude = input.longitude;

    try {
      return await this.locations.update(id, data);
    } catch (err) {
      if (isRecordNotFound(err)) throw locationNotFound();
      throw err;
    }
  }

  /** Desativa em vez de apagar: autorizações e histórico continuam apontando para o local. */
  async deactivate(id: string): Promise<void> {
    const current = await this.locations.findByIdWithTerminal(id);
    if (!current) throw locationNotFound();
    if ((await this.locations.countActiveChildren(id)) > 0) {
      throw AppError.conflict(
        'HAS_ACTIVE_CHILDREN',
        'Desative antes os locais que estão dentro deste.',
      );
    }
    if (current.terminal?.active) {
      throw AppError.conflict(
        'HAS_ACTIVE_TERMINAL',
        'Desative antes o terminal instalado nesta catraca.',
      );
    }
    await this.locations.update(id, { active: false });
  }

  private async assertValidParent(type: LocationType, parentId: string | undefined) {
    const expected = expectedParentType(type);
    if (expected === null) {
      if (parentId) {
        throw AppError.unprocessable(
          'INVALID_HIERARCHY',
          'O edifício é o nível mais alto: não fica dentro de outro local.',
        );
      }
      return;
    }

    const mustBeInside = `${LOCATION_LABEL[type]} precisa ficar dentro de: ${LOCATION_LABEL[expected]}.`;
    if (!parentId) throw AppError.unprocessable('INVALID_HIERARCHY', mustBeInside);

    const parent = await this.locations.findById(parentId);
    if (!parent) {
      throw AppError.unprocessable('PARENT_NOT_FOUND', 'O local de cima informado não existe.');
    }
    if (parent.type !== expected) throw AppError.unprocessable('INVALID_HIERARCHY', mustBeInside);
    if (!parent.active) {
      throw AppError.unprocessable('PARENT_INACTIVE', 'O local de cima está desativado.');
    }
  }
}

function assertCoordinates(type: LocationType, latitude: number | null): void {
  if (requiresCoordinates(type) && latitude === null) {
    throw AppError.unprocessable(
      'COORDINATES_REQUIRED',
      `${LOCATION_LABEL[type]} precisa de latitude e longitude.`,
    );
  }
}
