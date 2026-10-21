import type { RequestHandler } from 'express';
import { loginSchema, refreshTokenSchema } from '../models/auth.schemas.js';
import { toPublicUser } from '../models/user.schemas.js';
import type { AuthService } from '../services/auth.service.js';
import type { UserService } from '../services/user.service.js';
import { getAuth } from '../shared/auth-context.js';

export function authController(auth: AuthService, users: UserService) {
  const login: RequestHandler = async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await auth.login(email, password));
  };

  const refresh: RequestHandler = async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    res.json(await auth.refresh(refreshToken));
  };

  const logout: RequestHandler = async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await auth.logout(refreshToken);
    res.status(204).end();
  };

  const me: RequestHandler = async (_req, res) => {
    const user = await users.get(getAuth(res).userId);
    res.json(toPublicUser(user));
  };

  return { login, refresh, logout, me };
}
