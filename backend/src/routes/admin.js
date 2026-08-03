import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { auth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Todas as rotas aqui exigem admin
router.use(auth, requireRole('admin'));

// Criar usuário
const userSchema = z.object({
  fleet_id: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  role: z.enum(['driver', 'supervisor', 'admin']),
});

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
    const { fleet_id, name, email, password, role } = parsed.data;
    try {
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await query(
        `INSERT INTO users (fleet_id, name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, fleet_id`,
        [fleet_id ?? null, name, email.toLowerCase(), hash, role]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'E-mail já existe' });
      throw e;
    }
  })
);

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, name, email, role, fleet_id, active, created_at FROM users ORDER BY id`
    );
    res.json(rows);
  })
);

const userPatchSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(['driver', 'supervisor', 'admin']).optional(),
  fleet_id: z.number().int().positive().nullable().optional(),
});

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = userPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { active, role, fleet_id } = parsed.data;

    // impede o admin de desativar/rebaixar a própria conta por engano
    if (id === req.user.id && (active === false || (role && role !== 'admin')))
      return res.status(400).json({ error: 'Não é possível desativar ou rebaixar a própria conta' });

    const result = await query(
      `UPDATE users SET
         active = COALESCE($1, active),
         role = COALESCE($2, role),
         fleet_id = COALESCE($3, fleet_id)
       WHERE id = $4`,
      [active ?? null, role ?? null, fleet_id ?? null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ok: true });
  })
);

// Frotas + configuração de tolerância de desvio (metros)
const fleetSchema = z.object({
  name: z.string().min(1).max(200),
  tolerance_m: z.number().int().min(10).max(10000).optional(),
});

router.post(
  '/fleets',
  asyncHandler(async (req, res) => {
    const parsed = fleetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { name, tolerance_m } = parsed.data;
    const { rows } = await query(
      `INSERT INTO fleets (name, tolerance_m) VALUES ($1,$2) RETURNING *`,
      [name, tolerance_m ?? 150]
    );
    res.status(201).json(rows[0]);
  })
);

router.get(
  '/fleets',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM fleets ORDER BY id`);
    res.json(rows);
  })
);

const fleetPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tolerance_m: z.number().int().min(10).max(10000).optional(),
});

router.patch(
  '/fleets/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = fleetPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { tolerance_m, name } = parsed.data;
    const result = await query(
      `UPDATE fleets SET
         tolerance_m = COALESCE($1, tolerance_m),
         name = COALESCE($2, name)
       WHERE id = $3`,
      [tolerance_m ?? null, name ?? null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Frota não encontrada' });
    res.json({ ok: true });
  })
);

export default router;
