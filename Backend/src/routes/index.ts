import { Router } from 'express';
import { healthRoutes } from './health.routes.js';

export function apiRoutes(): Router {
  const router = Router();
  router.use(healthRoutes());
  return router;
}
