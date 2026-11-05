import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';

export const liveness: RequestHandler = (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
};

/** Pronta para receber tráfego só se o banco responde. */
export function readiness(prisma: PrismaClient): RequestHandler {
  return async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up' });
    } catch (err) {
      req.log.warn({ err }, 'banco indisponível');
      res.status(503).json({ status: 'unavailable', database: 'down' });
    }
  };
}
