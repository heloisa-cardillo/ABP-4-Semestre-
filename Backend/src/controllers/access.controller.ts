import type { RequestHandler } from 'express';
import { nfcAccessSchema, toTerminalAccessDecision } from '../models/access.schemas.js';
import type { AccessService } from '../services/access.service.js';
import { getTerminal } from '../shared/auth-context.js';

export function accessController(access: AccessService) {
  /** O terminal leu uma tag NFC e pergunta se abre a catraca. */
  const nfc: RequestHandler = async (req, res) => {
    const { uid } = nfcAccessSchema.parse(req.body);
    const decision = await access.nfc(getTerminal(res).terminalId, uid);
    res.set('Cache-Control', 'no-store').json(toTerminalAccessDecision(decision));
  };

  return { nfc };
}
