-- ============================================================
-- Schema RotaTravada
-- ============================================================

CREATE TABLE IF NOT EXISTS fleets (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  -- tolerância de desvio configurável pelo Admin, por frota (metros)
  tolerance_m   INTEGER NOT NULL DEFAULT 150,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Papéis: 'driver', 'supervisor', 'admin'
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  fleet_id      INTEGER REFERENCES fleets(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('driver','supervisor','admin')),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rota travada recebida do sistema de roteirização externo
CREATE TABLE IF NOT EXISTS routes (
  id            SERIAL PRIMARY KEY,
  fleet_id      INTEGER REFERENCES fleets(id) ON DELETE CASCADE,
  driver_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  external_ref  TEXT,                 -- id da rota no sistema de origem
  name          TEXT,
  -- Geometria travada em GeoJSON LineString: {"type":"LineString","coordinates":[[lng,lat],...]}
  geometry      JSONB NOT NULL,
  -- bbox pré-calculado [minLng,minLat,maxLng,maxLat] para pré-download de tiles
  bbox          JSONB,
  status        TEXT NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned','in_progress','completed','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pings de telemetria (posição do caminhão de volta ao backend)
CREATE TABLE IF NOT EXISTS telemetry (
  id            BIGSERIAL PRIMARY KEY,
  route_id      INTEGER REFERENCES routes(id) ON DELETE CASCADE,
  driver_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  speed         DOUBLE PRECISION,
  heading       DOUBLE PRECISION,
  -- distância calculada até a linha da rota (metros)
  distance_m    DOUBLE PRECISION,
  off_route     BOOLEAN NOT NULL DEFAULT false,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_route ON telemetry(route_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_driver ON telemetry(driver_id, recorded_at DESC);

-- Log de eventos de desvio + aprovações do supervisor
CREATE TABLE IF NOT EXISTS deviations (
  id            BIGSERIAL PRIMARY KEY,
  route_id      INTEGER REFERENCES routes(id) ON DELETE CASCADE,
  driver_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  distance_m    DOUBLE PRECISION NOT NULL,
  reason        TEXT,                 -- justificativa do motorista
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','approved','rejected')),
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ
);

-- Paradas sinalizadas pelo motorista
CREATE TABLE IF NOT EXISTS stops (
  id            BIGSERIAL PRIMARY KEY,
  route_id      INTEGER REFERENCES routes(id) ON DELETE CASCADE,
  driver_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
