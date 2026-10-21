import type { RequestHandler } from 'express';
import { idParamSchema } from '../models/common.schemas.js';
import {
  createTerminalSchema,
  listTerminalsQuerySchema,
  toPublicTerminal,
  toTerminalSelf,
  updateTerminalSchema,
} from '../models/terminal.schemas.js';
import type { TerminalService, TerminalWithCredential } from '../services/terminal.service.js';
import { getTerminal } from '../shared/auth-context.js';

const withCredential = ({ terminal, credential }: TerminalWithCredential) => ({
  terminal: toPublicTerminal(terminal),
  credential,
});

export function terminalController(terminals: TerminalService) {
  const create: RequestHandler = async (req, res) => {
    const created = await terminals.create(createTerminalSchema.parse(req.body));
    // A credencial aparece uma única vez: nada de cache no caminho.
    res
      .status(201)
      .set('Cache-Control', 'no-store')
      .location(`/api/v1/terminals/${created.terminal.id}`)
      .json(withCredential(created));
  };

  const list: RequestHandler = async (req, res) => {
    const query = listTerminalsQuerySchema.parse(req.query);
    const { items, total } = await terminals.list(query);
    res.json({
      data: items.map(toPublicTerminal),
      meta: { page: query.page, pageSize: query.pageSize, total },
    });
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(toPublicTerminal(await terminals.get(id)));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateTerminalSchema.parse(req.body);
    res.json(toPublicTerminal(await terminals.update(id, input)));
  };

  const deactivate: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await terminals.deactivate(id);
    res.status(204).end();
  };

  const rotateCredential: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const rotated = await terminals.rotateCredential(id);
    res.set('Cache-Control', 'no-store').json(withCredential(rotated));
  };

  /** O próprio terminal confere sua credencial e descobre onde está instalado. */
  const me: RequestHandler = async (_req, res) => {
    res.json(toTerminalSelf(await terminals.getWithLocation(getTerminal(res).terminalId)));
  };

  return { create, list, get, update, deactivate, rotateCredential, me };
}
