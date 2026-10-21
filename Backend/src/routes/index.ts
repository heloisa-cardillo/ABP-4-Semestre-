import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { locationRoutes } from './locations.routes.js';
import { terminalRoutes } from './terminals.routes.js';
import { userRoutes } from './users.routes.js';

export function apiRoutes(container: AppContainer): Router {
  const router = Router();
  router.use(healthRoutes(container));
  router.use(authRoutes(container));
  router.use(userRoutes(container));
  router.use(locationRoutes(container));
  router.use(terminalRoutes(container));
  return router;
}
