import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

// Seed idempotente: pode rodar mais de uma vez sem duplicar dados.
async function seed() {
  let fleetId;
  const existing = await pool.query(`SELECT id FROM fleets WHERE name = $1`, ['Frota Demo']);
  if (existing.rows[0]) {
    fleetId = existing.rows[0].id;
    console.log('ℹ️  Frota Demo já existe (id', fleetId + ')');
  } else {
    const fleet = await pool.query(
      `INSERT INTO fleets (name, tolerance_m) VALUES ($1,$2) RETURNING id`,
      ['Frota Demo', 150]
    );
    fleetId = fleet.rows[0].id;
  }

  const hash = (p) => bcrypt.hashSync(p, 10);

  await pool.query(
    `INSERT INTO users (fleet_id, name, email, password_hash, role) VALUES
     ($1,'Admin Geral','admin@demo.com',$2,'admin'),
     ($1,'Supervisor Um','sup@demo.com',$3,'supervisor'),
     ($1,'Motorista Um','motorista@demo.com',$4,'driver')
     ON CONFLICT (email) DO NOTHING`,
    [fleetId, hash('admin123'), hash('sup123'), hash('motorista123')]
  );

  console.log('✅ Seed criado.');
  console.log('   admin@demo.com / admin123');
  console.log('   sup@demo.com / sup123');
  console.log('   motorista@demo.com / motorista123');
  console.log('⚠️  APAGUE estes usuários de demonstração antes de ir para produção!');
  await pool.end();
}

seed().catch((e) => {
  console.error('❌ Erro no seed:', e);
  process.exit(1);
});
