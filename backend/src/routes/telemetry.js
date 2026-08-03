import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { auth, requireRole } from '../middleware/auth.js';
import { distanceToLine } from '../geo.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const latLng = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

// Garante que a rota existe E pertence ao motorista autenticado.
// Sem isso, qualquer motorista poderia gravar telemetria/desvios em rotas alheias.
async function getOwnedRoute(routeId, driverId) {
  const { rows } = await query(
    `SELECT r.id, r.geometry, f.tolerance_m
     FROM routes r JOIN fleets f ON f.id = r.fleet_id
     WHERE r.id = $1 AND r.driver_id = $2`,
    [routeId, driverId]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------
// Motorista envia ping periódico (ex: cada 30s).
// O backend recalcula a distância até a linha e marca off_route.
// ---------------------------------------------------------------
const pingSchema = z.object({
  route_id: z.number().int().positive(),
  ...latLng,
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
});

router.post(
  '/ping',
  auth,
  requireRole('driver'),
  asyncHandler(async (req, res) => {
    const parsed = pingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Ping inválido' });
    const { route_id, lat, lng, speed, heading } = parsed.data;

    const route = await getOwnedRoute(route_id, req.user.id);
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

    const coords = route.geometry.coordinates;
    const tolerance = route.tolerance_m;
    const distance = distanceToLine(coords, { lat, lng });
    const offRoute = distance > tolerance;

    await query(
      `INSERT INTO telemetry (route_id, driver_id, lat, lng, speed, heading, distance_m, off_route)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [route_id, req.user.id, lat, lng, speed ?? null, heading ?? null, distance, offRoute]
    );

    res.json({ distance_m: Math.round(distance), tolerance_m: tolerance, off_route: offRoute });
  })
);

// ---------------------------------------------------------------
// Sincronização OFFLINE: recebe em lote os pings que o app guardou
// enquanto estava sem conexão. Cada ping traz o recorded_at REAL
// da captura, preservando o histórico do trajeto.
// ---------------------------------------------------------------
const batchPingSchema = z.object({
  route_id: z.number().int().positive(),
  pings: z
    .array(
      z.object({
        ...latLng,
        speed: z.number().nullable().optional(),
        heading: z.number().nullable().optional(),
        // ISO 8601 com timezone, ex: "2026-08-03T14:22:31.000Z"
        recorded_at: z.string().datetime({ offset: true }),
      })
    )
    .min(1)
    .max(500),
});

router.post(
  '/ping/batch',
  auth,
  requireRole('driver'),
  asyncHandler(async (req, res) => {
    const parsed = batchPingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Lote inválido' });
    const { route_id, pings } = parsed.data;

    const route = await getOwnedRoute(route_id, req.user.id);
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

    const coords = route.geometry.coordinates;
    const tolerance = route.tolerance_m;
    const now = Date.now();

    // monta INSERT multi-linha parametrizado
    const values = [];
    const params = [];
    let i = 1;
    for (const p of pings) {
      const distance = distanceToLine(coords, { lat: p.lat, lng: p.lng });
      const offRoute = distance > tolerance;
      // timestamp no futuro (relógio do celular errado) é ajustado para agora
      let ts = new Date(p.recorded_at);
      if (ts.getTime() > now) ts = new Date(now);
      values.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
      params.push(
        route_id, req.user.id, p.lat, p.lng,
        p.speed ?? null, p.heading ?? null,
        distance, offRoute, ts.toISOString()
      );
    }

    await query(
      `INSERT INTO telemetry (route_id, driver_id, lat, lng, speed, heading, distance_m, off_route, recorded_at)
       VALUES ${values.join(',')}`,
      params
    );

    res.json({ inserted: pings.length, tolerance_m: tolerance });
  })
);

// ---------------------------------------------------------------
// Supervisor/Admin: posições mais recentes de cada motorista da frota
// ---------------------------------------------------------------
router.get(
  '/live',
  auth,
  requireRole('supervisor', 'admin'),
  asyncHandler(async (req, res) => {
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
  })
);

// ---------------------------------------------------------------
// Motorista registra um desvio com justificativa
// ---------------------------------------------------------------
const deviationSchema = z.object({
  route_id: z.number().int().positive(),
  ...latLng,
  distance_m: z.number().min(0),
  reason: z.string().max(1000).nullable().optional(),
});

router.post(
  '/deviation',
  auth,
  requireRole('driver'),
  asyncHandler(async (req, res) => {
    const parsed = deviationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { route_id, lat, lng, distance_m, reason } = parsed.data;

    const route = await getOwnedRoute(route_id, req.user.id);
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

    const { rows } = await query(
      `INSERT INTO deviations (route_id, driver_id, lat, lng, distance_m, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [route_id, req.user.id, lat, lng, distance_m, reason ?? null]
    );
    res.status(201).json(rows[0]);
  })
);

// Supervisor/Admin lista desvios abertos
router.get(
  '/deviations',
  auth,
  requireRole('supervisor', 'admin'),
  asyncHandler(async (req, res) => {
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
  })
);

// Supervisor aprova/rejeita desvio (supervisor só da própria frota)
router.patch(
  '/deviation/:id',
  auth,
  requireRole('supervisor', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const status = req.body.status;
    if (!['approved', 'rejected'].includes(status))
      return res.status(400).json({ error: 'Status inválido' });

    let result;
    if (req.user.role === 'supervisor') {
      result = await query(
        `UPDATE deviations d SET status=$1, reviewed_by=$2, reviewed_at=now()
         FROM routes r
         WHERE d.id=$3 AND r.id = d.route_id AND r.fleet_id = $4`,
        [status, req.user.id, id, req.user.fleet_id]
      );
    } else {
      result = await query(
        `UPDATE deviations SET status=$1, reviewed_by=$2, reviewed_at=now() WHERE id=$3`,
        [status, req.user.id, id]
      );
    }
    if (result.rowCount === 0)
      return res.status(404).json({ error: 'Desvio não encontrado' });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------
// Motorista sinaliza parada
// ---------------------------------------------------------------
const stopSchema = z.object({
  route_id: z.number().int().positive(),
  ...latLng,
  note: z.string().max(1000).nullable().optional(),
});

router.post(
  '/stop',
  auth,
  requireRole('driver'),
  asyncHandler(async (req, res) => {
    const parsed = stopSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { route_id, lat, lng, note } = parsed.data;

    const route = await getOwnedRoute(route_id, req.user.id);
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

    const { rows } = await query(
      `INSERT INTO stops (route_id, driver_id, lat, lng, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [route_id, req.user.id, lat, lng, note ?? null]
    );
    res.status(201).json(rows[0]);
  })
);

export default router;
