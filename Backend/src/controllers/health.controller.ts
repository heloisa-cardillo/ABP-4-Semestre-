import type { RequestHandler } from 'express';

export const liveness: RequestHandler = (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
};
