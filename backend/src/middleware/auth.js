import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Controle de acesso por papel (RBAC)
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão para esta ação' });
    }
    next();
  };
}

// Autenticação do webhook do sistema de roteirização (por API key).
// Comparação em tempo constante para evitar timing attack.
export function ingestKey(req, res, next) {
  const key = String(req.headers['x-api-key'] || '');
  const expected = String(process.env.ROUTE_INGEST_API_KEY || '');
  const a = crypto.createHash('sha256').update(key).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!expected || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'API key inválida' });
  }
  next();
}
