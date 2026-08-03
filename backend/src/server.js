import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import routeRoutes from './routes/routes.js';
import telemetryRoutes from './routes/telemetry.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

// Falha rápido se segredos obrigatórios não estiverem definidos
for (const key of ['JWT_SECRET', 'ROUTE_INGEST_API_KEY', 'DATABASE_URL']) {
  if (!process.env[key]) {
    console.error(`❌ Variável de ambiente obrigatória ausente: ${key}`);
    process.exit(1);
  }
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET muito curto para produção (mínimo 32 caracteres).');
  process.exit(1);
}

const app = express();

// Atrás do Nginx/proxy em produção (necessário p/ rate-limit ver o IP real)
app.set('trust proxy', 1);

app.use(helmet());

// CORS: em produção restrinja às origens necessárias (painéis web).
// App mobile nativo não é afetado por CORS.
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));

app.use(express.json({ limit: '5mb' })); // rotas GeoJSON podem ser grandes
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'tiny'));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/admin', adminRoutes);

// 404 para rotas desconhecidas
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// handler de erro genérico (nunca vaza stack trace para o cliente)
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚚 RotaTravada API on :${port}`));
