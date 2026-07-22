import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

async function seed() {
  const fleet = await pool.query(
    `INSERT INTO fleets (name, tolerance_m) VALUES ($1,$2) RETURNING id`,
    ['Frota Demo', 150]
  );
  const fleetId = fleet.rows[0].id;

  const hash = (p) => bcrypt.hashSync(p, 10);

  await pool.query(
    `INSERT INTO users (fleet_id, name, email, password_hash, role) VALUES
     ($1,'Admin Geral','admin@demo.com',$2,'admin'),
     ($1,'Supervisor Um','sup@demo.com',$3,'supervisor'),
     ($1,'Motorista Um','motorista@demo.com',$4,'driver')`,
    [fleetId, hash('admin123'), hash('sup123'), hash('motorista123')]
  );

  console.log('✅ Seed criado.');
  console.log('   admin@demo.com / admin123');
  console.log('   sup@demo.com / sup123');
  console.log('   motorista@demo.com / motorista123');
  await pool.end();
}

seed().catch((e) => {
  console.error('❌ Erro no seed:', e);
  process.exit(1);
});
