// Cálculo geoespacial mínimo sem dependências pesadas.
// Distância de um ponto GPS até a LineString da rota (em metros).

const R = 6371000; // raio da Terra em metros
const toRad = (d) => (d * Math.PI) / 180;

// Projeção equiretangular local: converte lng/lat para metros relativos a um ponto de referência.
function toXY(lng, lat, ref) {
  const x = toRad(lng - ref.lng) * Math.cos(toRad(ref.lat)) * R;
  const y = toRad(lat - ref.lat) * R;
  return { x, y };
}

// Distância de um ponto P ao segmento AB (em metros)
function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

// coords: array [[lng,lat],...] da LineString
// point: {lat,lng}
export function distanceToLine(coords, point) {
  if (!coords || coords.length === 0) return Infinity;
  const ref = { lng: point.lng, lat: point.lat };
  const p = toXY(point.lng, point.lat, ref);
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = toXY(coords[i][0], coords[i][1], ref);
    const b = toXY(coords[i + 1][0], coords[i + 1][1], ref);
    min = Math.min(min, distToSegment(p, a, b));
  }
  // caso a linha tenha um único ponto
  if (coords.length === 1) {
    const a = toXY(coords[0][0], coords[0][1], ref);
    min = Math.hypot(p.x - a.x, p.y - a.y);
  }
  return min;
}

// Calcula bounding box [minLng,minLat,maxLng,maxLat] para pré-download de tiles
export function bboxOf(coords) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}
