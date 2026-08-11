# RotaTravada — Route-Locked Fleet App with Linear Geofencing

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-0.7x-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre-GL-395AFF?logo=maplibre&logoColor=white)
![License](https://img.shields.io/badge/license-Proprietary-lightgrey)

**Full-stack fleet tracking system** built around a fixed, "locked" route. A Node.js + PostgreSQL backend, a React Native driver app (MapLibre + Turf.js), and a live supervisor panel work together to detect and log route deviations in real time — even offline.

> 🌐 **Language / Idioma:** **English** (below) · [**Português**](#rotatravada--app-de-rota-travada--geofencing-linear-pt-br)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [1. Backend](#1-backend)
- [2. Mobile App](#2-mobile-app)
- [3. Launch Checklist](#3-launch-checklist)
- [API Endpoints](#api-endpoints)
- [🇧🇷 Versão em Português](#rotatravada--app-de-rota-travada--geofencing-linear-pt-br)

---

## Overview

RotaTravada tracks delivery drivers against a **fixed route** rather than providing turn-by-turn navigation. The route is pushed in by an external routing system; the app draws it as a static line and continuously measures how far the driver strays from it. Cross the tolerance threshold and the driver gets an immediate audible and visual alert, while the supervisor sees the deviation on a live map.

Key characteristics:

- **Route-locked:** the app renders a fixed `LineString`. There is no turn-by-turn navigation and no rerouting.
- **Linear geofencing:** `@turf/point-to-line-distance` computes the perpendicular distance from the GPS position to the line. Beyond the tolerance → audible + visual alert.
- **Offline-first:** the route is cached in AsyncStorage and map tiles are pre-downloaded via `MapLibreGL.offlineManager`. Telemetry pings captured without a connection are queued on-device and synced in batches once connectivity returns, preserving the true capture time of each point.
- **RBAC:** `driver`, `supervisor`, and `admin` roles, enforced on the backend (JWT) and reflected in the app's navigation.

---

## Architecture

```
Routing System  ──(webhook POST /routes/ingest)──►  Backend (Node + Postgres)
                                                            ▲   │
                                    telemetry (ping 30s)     │   │ locked route
                                                            │   ▼
Supervisor (live panel)  ◄──────────────  Driver App (map + local geofencing)
```

---

## 1. Backend

### Option A — Docker (recommended)

```bash
cd backend
cp .env.example .env          # edit the secrets
docker compose up -d --build  # starts Postgres + API
docker compose exec api node src/db/migrate.js
docker compose exec api node src/db/seed.js
```

### Option B — Manual (PM2 on your Linux host)

```bash
cd backend
cp .env.example .env          # edit DATABASE_URL, JWT_SECRET, ROUTE_INGEST_API_KEY
npm install
npm run migrate
npm run seed
npm install -g pm2
pm2 start src/server.js --name rotatravada
pm2 save && pm2 startup       # start on boot
```

Health check: `curl http://localhost:3000/health`

**Seed users** (development only — remove before production):

- `admin@demo.com / admin123`
- `sup@demo.com / sup123`
- `motorista@demo.com / motorista123`

### How the external system sends a route

`POST /api/routes/ingest` with the header `X-API-Key: <ROUTE_INGEST_API_KEY>`.
Accepts a GeoJSON `LineString` or an array of `[lng, lat]` pairs. See `api-examples.http`.

---

## 2. Mobile App

```bash
cd mobile
npm install
# edit src/config.js -> API_URL (backend IP) and MAP_STYLE_URL
```

### Required native configuration

**MapLibre** (`@maplibre/maplibre-react-native`): follow the library's native install guide (adds the SDK to Android/iOS). No token required — it uses OSM.

**Android permissions** (`android/app/src/main/AndroidManifest.xml`):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
```

**iOS** (`Info.plist`): `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription`.

**Alert sound:** place `alert.mp3` in `android/app/src/main/res/raw/alert.mp3` and in the iOS bundle.

### Run

```bash
npx react-native run-android   # or run-ios
```

### OSM tiles in production

`openfreemap.org` is fine for testing. In production, to avoid depending on a third party and to get reliable offline support, host your own **TileServer GL** with an OSM extract (e.g. Geofabrik → Brazil/Santa Catarina) and point `MAP_STYLE_URL` at it. Managed alternatives: MapTiler, Protomaps.

---

## 3. Launch Checklist

1. **Server:** Linux VPS, HTTPS via Nginx + Let's Encrypt in front of the API. Do not expose port 3000 directly.
2. **Secrets:** replace `JWT_SECRET` and `ROUTE_INGEST_API_KEY` with long random values.
3. **Postgres backups:** scheduled `pg_dump` (cron), with an off-server copy.
4. **Integration:** have the routing-system team post to the webhook using the API key.
5. **Tolerance:** admins adjust it per fleet via `PATCH /api/admin/fleets/:id { tolerance_m }`.
6. **Store builds:**
   - Android: `./gradlew bundleRelease` → `.aab` on Google Play Console.
   - iOS: Archive in Xcode → App Store Connect / TestFlight.
7. **Pilot:** run with 2–3 real drivers before scaling. Validate battery consumption (`watchPosition` with `distanceFilter` already helps).

---

## API Endpoints

| Method | Route | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | log in, returns JWT |
| POST | `/api/routes/ingest` | API key | routing-system webhook |
| GET | `/api/routes/mine` | driver | assigned route |
| POST | `/api/telemetry/ping` | driver | periodic position |
| POST | `/api/telemetry/ping/batch` | driver | syncs offline-stored pings (history) |
| POST | `/api/telemetry/deviation` | driver | justify a deviation |
| POST | `/api/telemetry/stop` | driver | flag a stop |
| GET | `/api/telemetry/live` | supervisor/admin | drivers live |
| GET | `/api/telemetry/deviations` | supervisor/admin | open deviations |
| PATCH | `/api/telemetry/deviation/:id` | supervisor/admin | approve/reject |
| POST | `/api/admin/users` | admin | create user |
| PATCH | `/api/admin/fleets/:id` | admin | adjust tolerance |

<br>

---
---

<br>

# RotaTravada — App de Rota Travada + Geofencing Linear (PT-BR)

> 🌐 **Idioma / Language:** [**English**](#rotatravada--route-locked-fleet-app-with-linear-geofencing) · **Português** (abaixo)

Sistema completo: backend Node.js, app React Native (MapLibre + Turf.js) e telemetria em tempo real.

## Índice

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura-1)
- [1. Backend](#1-backend-1)
- [2. App Mobile](#2-app-mobile)
- [3. Checklist de lançamento](#3-checklist-de-lançamento)
- [Endpoints principais](#endpoints-principais)

---

## Visão geral

O RotaTravada rastreia motoristas de entrega contra uma **rota fixa**, em vez de oferecer navegação curva-a-curva. A rota é enviada por um sistema de roteirização externo; o app a desenha como uma linha fixa e mede continuamente o quanto o motorista se afasta dela. Ao ultrapassar a tolerância, o motorista recebe um alerta sonoro e visual imediato, enquanto o supervisor vê o desvio em um mapa ao vivo.

Características principais:

- **Rota travada:** o app desenha uma `LineString` fixa. Não há navegação curva-a-curva nem recálculo.
- **Geofencing linear:** `@turf/point-to-line-distance` calcula a distância perpendicular do GPS até a linha. Passou da tolerância → alerta sonoro + visual.
- **Offline:** rota em AsyncStorage + pré-download de tiles via `MapLibreGL.offlineManager`. Pings de telemetria capturados sem conexão são enfileirados no aparelho e sincronizados em lote quando a rede volta, preservando o horário real de captura de cada ponto.
- **RBAC:** `driver`, `supervisor`, `admin`, validado no backend (JWT) e refletido na navegação.

---

## Arquitetura

```
Sistema de Roteirização  ──(webhook POST /routes/ingest)──►  Backend (Node + Postgres)
                                                                    ▲   │
                                              telemetria (ping 30s)  │   │ rota travada
                                                                    │   ▼
Supervisor (painel ao vivo)  ◄──────────────  App Motorista (mapa + geofencing local)
```

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

**Usuários do seed** (apenas desenvolvimento — remova antes de produção):

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
3. **Backup do Postgres:** `pg_dump` agendado (cron), com cópia para fora do servidor.
4. **Integração:** peça ao time do sistema de roteirização para postar no webhook com a API key.
5. **Tolerância:** Admin ajusta por frota via `PATCH /api/admin/fleets/:id { tolerance_m }`.
6. **Build de loja:**
   - Android: `./gradlew bundleRelease` → `.aab` no Google Play Console.
   - iOS: Archive no Xcode → App Store Connect / TestFlight.
7. **Piloto:** rode com 2–3 motoristas reais antes de escalar. Valide consumo de bateria (o `watchPosition` com `distanceFilter` já ajuda).

---

## Endpoints principais

| Método | Rota | Papel | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | login, retorna JWT |
| POST | `/api/routes/ingest` | API key | webhook do roteirizador |
| GET | `/api/routes/mine` | driver | rota atribuída |
| POST | `/api/telemetry/ping` | driver | posição periódica |
| POST | `/api/telemetry/ping/batch` | driver | sincroniza pings salvos offline (histórico) |
| POST | `/api/telemetry/deviation` | driver | justifica desvio |
| POST | `/api/telemetry/stop` | driver | sinaliza parada |
| GET | `/api/telemetry/live` | supervisor/admin | motoristas ao vivo |
| GET | `/api/telemetry/deviations` | supervisor/admin | desvios abertos |
| PATCH | `/api/telemetry/deviation/:id` | supervisor/admin | aprova/rejeita |
| POST | `/api/admin/users` | admin | cria usuário |
| PATCH | `/api/admin/fleets/:id` | admin | ajusta tolerância |