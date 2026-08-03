import { point, lineString } from '@turf/helpers';
import pointToLineDistance from '@turf/point-to-line-distance';

// Recebe a geometria GeoJSON da rota (LineString) e a posição atual.
// Retorna { distanceM, offRoute } comparando com a tolerância.
//
// Este é o "Geofencing Linear": não há recálculo de rota, apenas a
// distância perpendicular do caminhão até a linha travada.
export function evaluatePosition(routeGeometry, coord, toleranceM) {
  try {
    const line = lineString(routeGeometry.coordinates);
    const p = point([coord.lng, coord.lat]);
    const distanceM = pointToLineDistance(p, line, { units: 'meters' });
    return { distanceM, offRoute: distanceM > toleranceM };
  } catch (e) {
    return { distanceM: Infinity, offRoute: false, error: true };
  }
}
