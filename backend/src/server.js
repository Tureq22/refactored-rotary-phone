import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import routeRoutes from './routes/routes.js';
import telemetryRoutes from './routes/telemetry.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // rotas GeoJSON podem ser grandes
app.use(morgan('tiny'));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/admin', adminRoutes);

// handler de erro genérico
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚚 RotaTravada API on :${port}`));
