import { describe, expect, it } from 'vitest';
import { LocationType } from '../../src/generated/prisma/enums.js';
import { expectedParentType, requiresCoordinates } from '../../src/services/location-rules.js';

describe('regras da hierarquia de locais', () => {
  it.each([
    [LocationType.BUILDING, null],
    [LocationType.GATEHOUSE, LocationType.BUILDING],
    [LocationType.DOOR, LocationType.GATEHOUSE],
    [LocationType.TURNSTILE, LocationType.DOOR],
  ])('%s fica dentro de %s', (type, parent) => {
    expect(expectedParentType(type)).toBe(parent);
  });

  it('só edifício e catraca exigem coordenadas', () => {
    expect(requiresCoordinates(LocationType.BUILDING)).toBe(true);
    expect(requiresCoordinates(LocationType.TURNSTILE)).toBe(true);
    expect(requiresCoordinates(LocationType.GATEHOUSE)).toBe(false);
    expect(requiresCoordinates(LocationType.DOOR)).toBe(false);
  });
});
