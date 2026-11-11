import type { RequestHandler } from 'express';
import {
  listAccessEventsQuerySchema,
  listMyAccessEventsQuerySchema,
  toPublicAccessEvent,
  type AccessEventDetails,
} from '../models/access-event.schemas.js';
import type { AccessHistoryService } from '../services/access-history.service.js';
import { getAuth } from '../shared/auth-context.js';

export function accessEventController(history: AccessHistoryService) {
  const page = (
    { items, total }: { items: AccessEventDetails[]; total: number },
    query: { page: number; pageSize: number },
  ) => ({
    data: items.map(toPublicAccessEvent),
    meta: { page: query.page, pageSize: query.pageSize, total },
  });

  const list: RequestHandler = async (req, res) => {
    const query = listAccessEventsQuerySchema.parse(req.query);
    res.json(page(await history.list(query), query));
  };

  const listMine: RequestHandler = async (req, res) => {
    const query = listMyAccessEventsQuerySchema.parse(req.query);
    res.json(page(await history.listMine(getAuth(res), query), query));
  };

  return { list, listMine };
}
