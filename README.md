# RotaTravada — App de Rota Travada + Geofencing Linear

Sistema completo: backend Node.js, app React Native (MapLibre + Turf.js) e telemetria em tempo real.

## Arquitetura

```
Sistema de Roteirização  ──(webhook POST /routes/ingest)──►  Backend (Node + Postgres)
                                                                    ▲   │
                                              telemetria (ping 30s)  │   │ rota travada
                                                                    │   ▼
Supervisor (painel ao vivo)  ◄──────────────  App Motorista (mapa + geofencing local)
```

- **Rota travada:** o app desenha uma `LineString` fixa. Não há navegação curva-a-curva nem recálculo.
- **Geofencing linear:** `@turf/point-to-line-distance` calcula a distância perpendicular do GPS até a linha. Passou da tolerância → alerta sonoro + visual.
- **Offline:** rota em AsyncStorage + pré-download de tiles via `MapLibreGL.offlineManager`.
- **RBAC:** `driver`, `supervisor`, `admin`, validado no backend (JWT) e refletido na navegação.

---

## 1. Backend

### Opção A — Docker (recomendado)
```bash
cd backend
cp .env.example .env          # edite os segredos
docker compose up -d --build  # sobe Postgres + API
docker compose exec api node src/db/migrate.js
docker compose exec api node src/db/seed.js
```

### Opção B — Manual (PM2 no seu Linux)
```bash
cd backend
cp .env.example .env          # edite DATABASE_URL, JWT_SECRET, ROUTE_INGEST_API_KEY
npm install
npm run migrate
npm run seed
npm install -g pm2
pm2 start src/server.js --name rotatravada
pm2 save && pm2 startup       # sobe no boot
```

Teste: `curl http://localhost:3000/health`

Usuários do seed:
- `admin@demo.com / admin123`
- `sup@demo.com / sup123`
- `motorista@demo.com / motorista123`

### Como o sistema externo envia a rota
`POST /api/routes/ingest` com header `X-API-Key: <ROUTE_INGEST_API_KEY>`.
Aceita GeoJSON `LineString` ou array de `[lng,lat]`. Veja `api-examples.http`.

---

## 2. App Mobile

```bash
cd mobile
npm install
# edite src/config.js -> API_URL (IP do backend) e MAP_STYLE_URL
```

### Configuração nativa obrigatória

**MapLibre** (`@maplibre/maplibre-react-native`): siga o guia de instalação nativa da lib (adiciona o SDK ao Android/iOS). Sem token — usa OSM.

**Permissões Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
```

**iOS** (`Info.plist`): `NSLocationWhenInUseUsageDescription` e `NSLocationAlwaysAndWhenInUseUsageDescription`.

**Som de alerta:** coloque `alert.mp3` em `android/app/src/main/res/raw/alert.mp3` e no bundle iOS.

### Rodar
```bash
npx react-native run-android   # ou run-ios
```

### Tiles OSM em produção
`openfreemap.org` serve para testes. Em produção, para não depender de terceiros e ter offline confiável, suba seu próprio **TileServer GL** com um extract do OSM (ex: Geofabrik → Brasil/Santa Catarina) e aponte `MAP_STYLE_URL` para ele. Alternativas gerenciadas: MapTiler, Protomaps.

---

## 3. Checklist de lançamento

1. **Servidor:** VPS Linux, HTTPS via Nginx + Let's Encrypt na frente da API. Não exponha a porta 3000 direto.
2. **Segredos:** troque `JWT_SECRET` e `ROUTE_INGEST_API_KEY` por valores aleatórios longos.
3. **Backup do Postgres:** `pg_dump` agendado (cron).
4. **Integração:** peça ao time do sistema de roteirização para postar no webhook com a API key.
5. **Tolerância:** Admin ajusta por frota via `PATCH /api/admin/fleets/:id { tolerance_m }`.
6. **Build de loja:**
   - Android: `./gradlew bundleRelease` → `.aab` no Google Play Console.
   - iOS: Archive no Xcode → App Store Connect / TestFlight.
7. **Piloto:** rode com 2–3 motoristas reais antes de escalar. Valide consumo de bateria (o `watchPosition` com `distanceFilter` já ajuda).

## Endpoints principais

| Método | Rota | Papel | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | login, retorna JWT |
| POST | `/api/routes/ingest` | API key | webhook do roteirizador |
| GET | `/api/routes/mine` | driver | rota atribuída |
| POST | `/api/telemetry/ping` | driver | posição periódica |
| POST | `/api/telemetry/deviation` | driver | justifica desvio |
| POST | `/api/telemetry/stop` | driver | sinaliza parada |
| GET | `/api/telemetry/live` | supervisor/admin | motoristas ao vivo |
| GET | `/api/telemetry/deviations` | supervisor/admin | desvios abertos |
| PATCH | `/api/telemetry/deviation/:id` | supervisor/admin | aprova/rejeita |
| POST | `/api/admin/users` | admin | cria usuário |
| PATCH | `/api/admin/fleets/:id` | admin | ajusta tolerância |
