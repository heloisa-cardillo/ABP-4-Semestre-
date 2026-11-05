import { z } from 'zod';
import type { Location, Terminal } from '../generated/prisma/client.js';
import { paginationQuerySchema } from './common.schemas.js';

export const createTerminalSchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Informe o nome.').max(120),
    locationId: z.uuid().meta({ description: 'Catraca onde o terminal fica instalado.' }),
  })
  .meta({ id: 'CreateTerminalInput' });

export const updateTerminalSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(120).optional(),
    active: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Informe ao menos um campo para alterar.')
  .meta({ id: 'UpdateTerminalInput' });

export const listTerminalsQuerySchema = paginationQuerySchema.extend({
  active: z.stringbool().optional(),
});

export const publicTerminalSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    locationId: z.uuid(),
    active: z.boolean(),
    lastSeenAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Terminal' });

export const terminalWithCredentialSchema = z
  .object({
    terminal: publicTerminalSchema,
    credential: z.string().meta({
      description:
        'Credencial do dispositivo (`<id>.<segredo>`). Aparece só agora: grave no firmware. O terminal envia `Authorization: Terminal <credential>`.',
    }),
  })
  .meta({ id: 'TerminalWithCredential' });

export const terminalSelfSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    location: z.object({
      id: z.uuid(),
      name: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
    }),
  })
  .meta({ id: 'TerminalSelf' });

export type CreateTerminalInput = z.infer<typeof createTerminalSchema>;
export type UpdateTerminalInput = z.infer<typeof updateTerminalSchema>;
export type ListTerminalsQuery = z.infer<typeof listTerminalsQuerySchema>;

/** O que sai da API sobre um terminal. O hash do segredo nunca sai. */
export function toPublicTerminal(terminal: Terminal) {
  return {
    id: terminal.id,
    name: terminal.name,
    locationId: terminal.locationId,
    active: terminal.active,
    lastSeenAt: terminal.lastSeenAt?.toISOString() ?? null,
    createdAt: terminal.createdAt.toISOString(),
    updatedAt: terminal.updatedAt.toISOString(),
  };
}

export function toTerminalSelf(terminal: Terminal & { location: Location }) {
  return {
    id: terminal.id,
    name: terminal.name,
    location: {
      id: terminal.location.id,
      name: terminal.location.name,
      latitude: terminal.location.latitude,
      longitude: terminal.location.longitude,
    },
  };
}
