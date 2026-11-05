import { LocationType } from '../generated/prisma/enums.js';

/** Nome de cada nível para as mensagens ao administrador. */
export const LOCATION_LABEL: Record<LocationType, string> = {
  BUILDING: 'Edifício',
  GATEHOUSE: 'Portaria',
  DOOR: 'Porta',
  TURNSTILE: 'Catraca',
};

const PARENT_TYPE: Record<LocationType, LocationType | null> = {
  BUILDING: null,
  GATEHOUSE: LocationType.BUILDING,
  DOOR: LocationType.GATEHOUSE,
  TURNSTILE: LocationType.DOOR,
};

/** Nível imediatamente acima na hierarquia Edifício › Portaria › Porta › Catraca (`null` no edifício). */
export function expectedParentType(type: LocationType): LocationType | null {
  return PARENT_TYPE[type];
}

/**
 * Edifício e catraca precisam de coordenadas: o edifício identifica onde fica o prédio (RF02)
 * e a catraca é o ponto contra o qual se mede a distância do celular (RF13).
 */
export function requiresCoordinates(type: LocationType): boolean {
  return type === LocationType.BUILDING || type === LocationType.TURNSTILE;
}
