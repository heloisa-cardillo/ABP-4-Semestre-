/** Ponto em graus decimais (WGS 84). */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Distância máxima entre o celular e a catraca para o QR Code valer (RF13). */
export const MAX_QR_DISTANCE_METERS = 100;

/** Raio médio da Terra (IUGG), em metros. */
const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function distanceInMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}
