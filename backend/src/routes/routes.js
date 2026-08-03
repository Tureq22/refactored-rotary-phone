import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { auth, requireRole, ingestKey } from '../middleware/auth.js';
import { bboxOf } from '../geo.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// ---------------------------------------------------------------
// WEBHOOK: recebe rota do sistema de roteirização externo.
// Auth por X-API-Key (não JWT), pois é máquina-a-máquina.
// ---------------------------------------------------------------
const coordPair = z.tuple([
  z.number().min(-180).max(180), // lng
  z.number().min(-90).max(90),   // lat
]);

const ingestSchema = z.object({
  external_ref: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  fleet_id: z.number().int().positive(),
  driver_id: z.number().int().positive().nullable().optional(),
  geometry: z
    .object({
      type: z.literal('LineString'),
      coordinates: z.array(coordPair).min(2).max(50000),
    })
    .optional(),
  coordinates: z.array(coordPair).min(2).max(50000).optional(),
});

router.post(
  '/ingest',
  ingestKey,
  asyncHandler(async (req, res) => {
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Payload inválido', details: parsed.error.issues });

    const { external_ref, name, fleet_id, driver_id } = parsed.data;
    const coords = parsed.data.geometry?.coordinates || parsed.data.coordinates;
    if (!coords || coords.length < 2)
      return res.status(400).json({ error: 'É necessária uma LineString com ao menos 2 pontos' });

    // valida FK antes do insert para responder 400 em vez de 500
    const fleet = await query(`SELECT id FROM fleets WHERE id = $1`, [fleet_id]);
    if (!fleet.rows[0]) return res.status(400).json({ error: 'fleet_id inexistente' });
    if (driver_id) {
      const drv = await query(
        `SELECT id FROM users WHERE id = $1 AND role = 'driver' AND active`,
        [driver_id]
      );
      if (!drv.rows[0]) return res.status(400).json({ error: 'driver_id inválido ou inativo' });
    }

    const geometry = { type: 'LineString', coordinates: coords };
    const bbox = bboxOf(coords);

    const { rows } = await query(
      `INSERT INTO routes (fleet_id, driver_id, external_ref, name, geometry, bbox, status)
       VALUES ($1,$2,$3,$4,$5,$6,'assigned')
       RETURNING id, fleet_id, driver_id, external_ref, name, status, bbox, created_at`,
      [fleet_id, driver_id ?? null, external_ref ?? null, name ?? null, geometry, JSON.stringify(bbox)]
    );

    res.status(201).json(rows[0]);
  })
);

// ---------------------------------------------------------------
// Motorista: pega a rota atribuída a ele (mais recente ativa)
// ---------------------------------------------------------------
router.get(
  '/mine',
  auth,
  requireRole('driver'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT r.id, r.name, r.external_ref, r.geometry, r.bbox, r.status, r.created_at,
              f.tolerance_m
       FROM routes r
       JOIN fleets f ON f.id = r.fleet_id
       WHERE r.driver_id = $1 AND r.status IN ('assigned','in_progress')
       ORDER BY r.created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Nenhuma rota atribuída' });
    res.json(rows[0]);
  })
);

// ---------------------------------------------------------------
// Supervisor/Admin: lista rotas da frota
// ---------------------------------------------------------------
router.get(
  '/',
  auth,
  requireRole('supervisor', 'admin'),
  asyncHandler(async (req, res) => {
    const params = [];
    let where = '';
    if (req.user.role === 'supervisor') {
      where = 'WHERE r.fleet_id = $1';
      params.push(req.user.fleet_id);
    }
    const { rows } = await query(
      `SELECT r.id, r.name, r.status, r.driver_id, u.name AS driver_name, r.created_at
       FROM routes r LEFT JOIN users u ON u.id = r.driver_id
       ${where}
       ORDER BY r.created_at DESC LIMIT 200`,
      params
    );
    res.json(rows);
  })
);

// Detalhe da rota (com geometria) para supervisor/admin
router.get(
  '/:id',
  auth,
  requireRole('supervisor', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const { rows } = await query(`SELECT * FROM routes WHERE id = $1`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Rota não encontrada' });
    if (req.user.role === 'supervisor' && rows[0].fleet_id !== req.user.fleet_id)
      return res.status(403).json({ error: 'Rota de outra frota' });
    res.json(rows[0]);
  })
);

// Motorista marca rota como iniciada/concluída (só a própria rota)
router.patch(
  '/:id/status',
  auth,
  requireRole('driver'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const status = req.body.status;
    if (!['in_progress', 'completed'].includes(status))
      return res.status(400).json({ error: 'Status inválido' });
    const result = await query(
      `UPDATE routes SET status=$1 WHERE id=$2 AND driver_id=$3`,
      [status, id, req.user.id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ error: 'Rota não encontrada ou não é sua' });
    res.json({ ok: true });
  })
);

export default router;
