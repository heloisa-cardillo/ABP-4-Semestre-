import { z } from 'zod';
import type { Location } from '../generated/prisma/client.js';
import { LocationType } from '../generated/prisma/enums.js';
import { paginationQuerySchema } from './common.schemas.js';

export const locationTypeSchema = z.enum(LocationType).meta({
  id: 'LocationType',
  description: 'BUILDING = edifício, GATEHOUSE = portaria, DOOR = porta, TURNSTILE = catraca',
});

const nameSchema = z.string().trim().min(2, 'Informe o nome.').max(120);
const descriptionSchema = z.string().trim().max(500);
const addressSchema = z.string().trim().min(5, 'Informe o endereço completo.').max(255);
const latitudeSchema = z.number().min(-90).max(90).meta({ example: -23.305 });
const longitudeSchema = z.number().min(-180).max(180).meta({ example: -45.9658 });

/** Latitude e longitude andam juntas: as duas informadas, as duas nulas ou as duas ausentes. */
const coordinatesTogether = (input: { latitude?: unknown; longitude?: unknown }) =>
  (input.latitude === undefined) === (input.longitude === undefined) &&
  (input.latitude === null) === (input.longitude === null);
const coordinatesMessage = {
  message: 'Informe latitude e longitude juntas.',
  path: ['latitude'],
};

export const createLocationSchema = z
  .strictObject({
    type: locationTypeSchema,
    name: nameSchema,
    description: descriptionSchema.optional(),
    address: addressSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    parentId: z
      .uuid()
      .optional()
      .meta({ description: 'Local do nível de cima. Vazio no edifício.' }),
  })
  .refine(coordinatesTogether, coordinatesMessage)
  .meta({ id: 'CreateLocationInput' });

export const updateLocationSchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    address: addressSchema.nullable().optional(),
    latitude: latitudeSchema.nullable().optional(),
    longitude: longitudeSchema.nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Informe ao menos um campo para alterar.')
  .refine(coordinatesTogether, coordinatesMessage)
  .meta({ id: 'UpdateLocationInput' });

export const listLocationsQuerySchema = paginationQuerySchema.extend({
  type: locationTypeSchema.optional(),
  parentId: z.uuid().optional(),
  active: z.stringbool().optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const publicLocationSchema = z
  .object({
    id: z.uuid(),
    type: locationTypeSchema,
    name: z.string(),
    description: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    parentId: z.uuid().nullable(),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Location' });

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;
export type PublicLocation = z.infer<typeof publicLocationSchema>;

export function toPublicLocation(location: Location): PublicLocation {
  return {
    id: location.id,
    type: location.type,
    name: location.name,
    description: location.description,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    parentId: location.parentId,
    active: location.active,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}
