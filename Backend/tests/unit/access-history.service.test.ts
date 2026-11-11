import { describe, expect, it, vi } from 'vitest';
import { AccessMethod, AccessResult, Role } from '../../src/generated/prisma/enums.js';
import { AccessHistoryService } from '../../src/services/access-history.service.js';

const SP = 'America/Sao_Paulo';
const PAGE = { page: 1, pageSize: 20 };

function setup(descendants: string[] = []) {
  const events = { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
  const locations = { findDescendantIds: vi.fn().mockResolvedValue(descendants) };
  const service = new AccessHistoryService(events, locations, SP);
  return { service, events, locations };
}

describe('AccessHistoryService.list', () => {
  it('sem filtros não restringe nada', async () => {
    const { service, events, locations } = setup();
    await service.list({ ...PAGE });

    expect(locations.findDescendantIds).not.toHaveBeenCalled();
    expect(events.list).toHaveBeenCalledWith(
      {
        userId: undefined,
        locationIds: undefined,
        terminalId: undefined,
        method: undefined,
        result: undefined,
        since: undefined,
        until: undefined,
      },
      PAGE,
    );
  });

  it('troca o local pelos locais abaixo dele e o período por instantes no fuso do edifício', async () => {
    const { service, events, locations } = setup(['predio', 'catraca']);
    await service.list({
      page: 2,
      pageSize: 5,
      userId: 'u1',
      locationId: 'predio',
      terminalId: 't1',
      method: AccessMethod.NFC,
      result: AccessResult.DENIED,
      from: '2026-11-10',
      to: '2026-11-11',
    });

    expect(locations.findDescendantIds).toHaveBeenCalledWith('predio');
    expect(events.list).toHaveBeenCalledWith(
      {
        userId: 'u1',
        locationIds: ['predio', 'catraca'],
        terminalId: 't1',
        method: AccessMethod.NFC,
        result: AccessResult.DENIED,
        since: new Date('2026-11-10T03:00:00.000Z'),
        // `to` é inclusive: vai até o começo do dia seguinte.
        until: new Date('2026-11-12T03:00:00.000Z'),
      },
      { page: 2, pageSize: 5 },
    );
  });
});

describe('AccessHistoryService.listMine', () => {
  it('sempre filtra pela pessoa logada', async () => {
    const { service, events } = setup();
    await service.listMine(
      { userId: 'eu', role: Role.VISITOR },
      { ...PAGE, result: AccessResult.GRANTED, to: '2026-11-11' },
    );

    expect(events.list).toHaveBeenCalledWith(
      {
        userId: 'eu',
        method: undefined,
        result: AccessResult.GRANTED,
        since: undefined,
        until: new Date('2026-11-12T03:00:00.000Z'),
      },
      PAGE,
    );
  });
});
