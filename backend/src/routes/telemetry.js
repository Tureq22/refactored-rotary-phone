import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { auth, requireRole } from '../middleware/auth.js';
import { distanceToLine } from '../geo.js';

const router = Router();

// ---------------------------------------------------------------
// Motorista envia ping periódico (ex: cada 30s).
// O backend recalcula a distância até a linha e marca off_route.
// (O app também calcula localmente para o alerta imediato; o backend
//  serve de fonte de verdade para o supervisor.)
// ---------------------------------------------------------------
const pingSchema = z.object({
  route_id: z.number().int(),
  lat: z.number(),
  lng: z.number(),
  speed: z.number().optional(),
  heading: z.number().optional(),
});

router.post('/ping', auth, async (req, res) => {
  const parsed = pingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ping inválido' });
  const { route_id, lat, lng, speed, heading } = parsed.data;

  // pega geometria da rota + tolerância da frota
  const { rows } = await query(
    `SELECT r.geometry, f.tolerance_m
     FROM routes r JOIN fleets f ON f.id = r.fleet_id
     WHERE r.id = $1`,
    [route_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Rota não encontrada' });

  const coords = rows[0].geometry.coordinates;
  const tolerance = rows[0].tolerance_m;
  const distance = distanceToLine(coords, { lat, lng });
  const offRoute = distance > tolerance;

  await query(
    `INSERT INTO telemetry (route_id, driver_id, lat, lng, speed, heading, distance_m, off_route)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [route_id, req.user.id, lat, lng, speed ?? null, heading ?? null, distance, offRoute]
  );

  res.json({ distance_m: Math.round(distance), tolerance_m: tolerance, off_route: offRoute });
});

// ---------------------------------------------------------------
// Supervisor/Admin: posições mais recentes de cada motorista da frota
// ---------------------------------------------------------------
router.get('/live', auth, requireRole('supervisor', 'admin'), async (req, res) => {
  const params = [];
  let fleetFilter = '';
  if (req.user.role === 'supervisor') {
    fleetFilter = 'AND r.fleet_id = $1';
    params.push(req.user.fleet_id);
  }
  const { rows } = await query(
    `SELECT DISTINCT ON (t.driver_id)
       t.driver_id, u.name AS driver_name, t.route_id,
       t.lat, t.lng, t.speed, t.distance_m, t.off_route, t.recorded_at
     FROM telemetry t
     JOIN routes r ON r.id = t.route_id
     JOIN users u ON u.id = t.driver_id
     WHERE t.recorded_at > now() - interval '15 minutes' ${fleetFilter}
     ORDER BY t.driver_id, t.recorded_at DESC`,
    params
  );
  res.json(rows);
});

// ---------------------------------------------------------------
// Motorista registra um desvio com justificativa
// ---------------------------------------------------------------
router.post('/deviation', auth, async (req, res) => {
  const { route_id, lat, lng, distance_m, reason } = req.body;
  const { rows } = await query(
    `INSERT INTO deviations (route_id, driver_id, lat, lng, distance_m, reason)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [route_id, req.user.id, lat, lng, distance_m, reason ?? null]
  );
  res.status(201).json(rows[0]);
});

// Supervisor/Admin lista desvios abertos
router.get('/deviations', auth, requireRole('supervisor', 'admin'), async (req, res) => {
  const params = [];
  let fleetFilter = '';
  if (req.user.role === 'supervisor') {
    fleetFilter = 'AND r.fleet_id = $1';
    params.push(req.user.fleet_id);
  }
  const { rows } = await query(
    `SELECT d.*, u.name AS driver_name
     FROM deviations d
     JOIN routes r ON r.id = d.route_id
     JOIN users u ON u.id = d.driver_id
     WHERE d.status = 'open' ${fleetFilter}
     ORDER BY d.created_at DESC`,
    params
  );
  res.json(rows);
});

// Supervisor aprova/rejeita desvio
router.patch('/deviation/:id', auth, requireRole('supervisor', 'admin'), async (req, res) => {
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Status inválido' });
  await query(
    `UPDATE deviations SET status=$1, reviewed_by=$2, reviewed_at=now() WHERE id=$3`,
    [status, req.user.id, req.params.id]
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------
// Motorista sinaliza parada
// ---------------------------------------------------------------
router.post('/stop', auth, async (req, res) => {
  const { route_id, lat, lng, note } = req.body;
  const { rows } = await query(
    `INSERT INTO stops (route_id, driver_id, lat, lng, note)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [route_id, req.user.id, lat, lng, note ?? null]
  );
  res.status(201).json(rows[0]);
});

export default router;
