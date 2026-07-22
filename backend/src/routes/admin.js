import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = Router();

// Todas as rotas aqui exigem admin
router.use(auth, requireRole('admin'));

// Criar usuário
const userSchema = z.object({
  fleet_id: z.number().int().nullable().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['driver', 'supervisor', 'admin']),
});

router.post('/users', async (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const { fleet_id, name, email, password, role } = parsed.data;
  try {
    const { rows } = await query(
      `INSERT INTO users (fleet_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, fleet_id`,
      [fleet_id ?? null, name, email, bcrypt.hashSync(password, 10), role]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'E-mail já existe' });
    throw e;
  }
});

router.get('/users', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, role, fleet_id, active, created_at FROM users ORDER BY id`
  );
  res.json(rows);
});

router.patch('/users/:id', async (req, res) => {
  const { active, role, fleet_id } = req.body;
  await query(
    `UPDATE users SET
       active = COALESCE($1, active),
       role = COALESCE($2, role),
       fleet_id = COALESCE($3, fleet_id)
     WHERE id = $4`,
    [active ?? null, role ?? null, fleet_id ?? null, req.params.id]
  );
  res.json({ ok: true });
});

// Frotas + configuração de tolerância de desvio (metros)
router.post('/fleets', async (req, res) => {
  const { name, tolerance_m } = req.body;
  const { rows } = await query(
    `INSERT INTO fleets (name, tolerance_m) VALUES ($1,$2) RETURNING *`,
    [name, tolerance_m ?? 150]
  );
  res.status(201).json(rows[0]);
});

router.get('/fleets', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM fleets ORDER BY id`);
  res.json(rows);
});

router.patch('/fleets/:id', async (req, res) => {
  const { tolerance_m, name } = req.body;
  await query(
    `UPDATE fleets SET
       tolerance_m = COALESCE($1, tolerance_m),
       name = COALESCE($2, name)
     WHERE id = $3`,
    [tolerance_m ?? null, name ?? null, req.params.id]
  );
  res.json({ ok: true });
});

export default router;
