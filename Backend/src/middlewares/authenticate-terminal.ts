import type { RequestHandler } from 'express';
import type { TerminalService } from '../services/terminal.service.js';
import { AppError } from '../shared/app-error.js';

const TERMINAL_SCHEME = /^Terminal (\S{1,200})$/;

/**
 * Exige a credencial do dispositivo (`Authorization: Terminal <id>.<segredo>`)
 * e guarda o terminal em `res.locals.terminal`. JWT de usuário não serve aqui.
 */
export function authenticateTerminal(terminals: TerminalService): RequestHandler {
  return async (req, res, next) => {
    const credential = TERMINAL_SCHEME.exec(req.headers.authorization ?? '')?.[1];
    if (!credential) {
      throw AppError.unauthorized('Credencial do terminal ausente.', 'INVALID_TERMINAL_CREDENTIAL');
    }
    const terminal = await terminals.authenticate(credential);
    res.locals.terminal = { terminalId: terminal.id, locationId: terminal.locationId };
    next();
  };
}
