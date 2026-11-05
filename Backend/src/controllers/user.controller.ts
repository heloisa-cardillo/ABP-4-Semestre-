import type { RequestHandler } from 'express';
import { idParamSchema } from '../models/common.schemas.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  toPublicUser,
  updateUserSchema,
} from '../models/user.schemas.js';
import type { UserService } from '../services/user.service.js';
import { getAuth } from '../shared/auth-context.js';

export function userController(users: UserService) {
  const create: RequestHandler = async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const user = await users.create(input);
    res.status(201).location(`/api/v1/users/${user.id}`).json(toPublicUser(user));
  };

  const list: RequestHandler = async (req, res) => {
    const query = listUsersQuerySchema.parse(req.query);
    const { items, total } = await users.list(query);
    res.json({
      data: items.map(toPublicUser),
      meta: { page: query.page, pageSize: query.pageSize, total },
    });
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(toPublicUser(await users.get(id)));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    res.json(toPublicUser(await users.update(getAuth(res), id, input)));
  };

  const deactivate: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await users.deactivate(getAuth(res), id);
    res.status(204).end();
  };

  return { create, list, get, update, deactivate };
}
