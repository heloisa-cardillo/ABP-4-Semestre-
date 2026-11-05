import type { RequestHandler } from 'express';
import { idParamSchema } from '../models/common.schemas.js';
import {
  createLocationSchema,
  listLocationsQuerySchema,
  toPublicLocation,
  updateLocationSchema,
} from '../models/location.schemas.js';
import type { LocationService } from '../services/location.service.js';

export function locationController(locations: LocationService) {
  const create: RequestHandler = async (req, res) => {
    const location = await locations.create(createLocationSchema.parse(req.body));
    res.status(201).location(`/api/v1/locations/${location.id}`).json(toPublicLocation(location));
  };

  const list: RequestHandler = async (req, res) => {
    const query = listLocationsQuerySchema.parse(req.query);
    const { items, total } = await locations.list(query);
    res.json({
      data: items.map(toPublicLocation),
      meta: { page: query.page, pageSize: query.pageSize, total },
    });
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(toPublicLocation(await locations.get(id)));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateLocationSchema.parse(req.body);
    res.json(toPublicLocation(await locations.update(id, input)));
  };

  const deactivate: RequestHandler = async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await locations.deactivate(id);
    res.status(204).end();
  };

  return { create, list, get, update, deactivate };
}
