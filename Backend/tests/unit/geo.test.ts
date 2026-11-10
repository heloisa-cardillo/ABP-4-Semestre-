import { describe, expect, it } from 'vitest';
import { distanceInMeters, MAX_QR_DISTANCE_METERS } from '../../src/services/geo.js';

const turnstile = { latitude: -23.30501, longitude: -45.96581 };

describe('distanceInMeters', () => {
  it('o mesmo ponto dá 0 m', () => {
    expect(distanceInMeters(turnstile, turnstile)).toBe(0);
  });

  it('0,0009° de latitude dá cerca de 100 m', () => {
    const north = { ...turnstile, latitude: turnstile.latitude + 0.0009 };
    expect(distanceInMeters(turnstile, north)).toBeCloseTo(100.08, 1);
  });

  it('0,009° de latitude dá cerca de 1 km', () => {
    const north = { ...turnstile, latitude: turnstile.latitude + 0.009 };
    expect(distanceInMeters(turnstile, north)).toBeCloseTo(1000.8, 0);
  });

  it('na longitude a distância encolhe com o cosseno da latitude', () => {
    const east = { ...turnstile, longitude: turnstile.longitude + 0.0009 };
    const expected = 100.08 * Math.cos((turnstile.latitude * Math.PI) / 180);
    expect(distanceInMeters(turnstile, east)).toBeCloseTo(expected, 0);
  });

  it('é simétrica', () => {
    const other = { latitude: -23.2237, longitude: -45.9009 };
    expect(distanceInMeters(turnstile, other)).toBeCloseTo(distanceInMeters(other, turnstile), 6);
  });

  it('distância conhecida: São José dos Campos a Jacareí, cerca de 16 km', () => {
    const sjc = { latitude: -23.1791, longitude: -45.8872 };
    const jacarei = { latitude: -23.3053, longitude: -45.9658 };
    expect(distanceInMeters(sjc, jacarei) / 1000).toBeCloseTo(16.1, 0);
  });

  it('o limite do QR é 100 m', () => {
    expect(MAX_QR_DISTANCE_METERS).toBe(100);
  });
});
