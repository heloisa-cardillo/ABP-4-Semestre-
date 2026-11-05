import type { RequestHandler } from 'express';
import { redeemQrSchema, toAccessDecisionResponse, toIssuedQrCode } from '../models/qr.schemas.js';
import type { QrCodeService } from '../services/qr-code.service.js';
import { getAuth, getTerminal } from '../shared/auth-context.js';

export function qrController(qr: QrCodeService) {
  /** O terminal pede o próximo código para exibir. */
  const issue: RequestHandler = async (_req, res) => {
    const issued = await qr.issue(getTerminal(res).terminalId);
    // O código é uma credencial de uso único: nada de cache no caminho.
    res.status(201).set('Cache-Control', 'no-store').json(toIssuedQrCode(issued));
  };

  /** O app envia o código lido e a posição do celular. */
  const redeem: RequestHandler = async (req, res) => {
    const input = redeemQrSchema.parse(req.body);
    const decision = await qr.redeem(getAuth(res), input);
    res.json(toAccessDecisionResponse(decision));
  };

  return { issue, redeem };
}
