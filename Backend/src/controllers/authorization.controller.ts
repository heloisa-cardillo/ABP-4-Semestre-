import type { RequestHandler } from 'express';
import {
  cancelAuthorizationSchema,
  createAuthorizationSchema,
  listAuthorizationsQuerySchema,
  listMyAuthorizationsQuerySchema,
  toPublicAuthorization,
  type AuthorizationDetails,
} from '../models/authorization.schemas.js';
import { idParamSchema } from '../models/common.schemas.js';
import type { AuthorizationService } from '../services/authorization.service.js';
import { getAuth } from '../shared/auth-context.js';

export function authorizationController(authorizations: AuthorizationService) {
  const toPublic = (a: AuthorizationDetails) => toPublicAuthorization(a, authorizations.today());

  const page = (
    { items, total }: { items: AuthorizationDetails[]; total: number },
    query: { page: number; pageSize: number },
  ) => {
    const today = authorizations.today();
    return {
      data: items.map((a) => toPublicAuthorization(a, today)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  };

  const create: RequestHandler = async (req, res) => {
    const input = createAuthorizationSchema.parse(req.body);
    const created = await authorizations.create(getAuth(res), input);
    res.status(201).location(`/api/v1/authorizations/${created.id}`).json(toPublic(created));
  };

  const list: RequestHandler = async (req, res) => {
    const query = listAuthorizationsQuerySchema.parse(req.query);
    res.json(page(await authorizations.list(query), query));
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(toPublic(await authorizations.get(id)));
  };

  const cancel: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = cancelAuthorizationSchema.parse(req.body ?? {});
    res.json(toPublic(await authorizations.cancel(getAuth(res), id, input)));
  };

  const listMine: RequestHandler = async (req, res) => {
    const query = listMyAuthorizationsQuerySchema.parse(req.query);
    res.json(page(await authorizations.listMine(getAuth(res), query), query));
  };

  return { create, list, get, cancel, listMine };
}
