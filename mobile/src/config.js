// Ajuste para o IP/domínio do seu backend.
export const API_URL = 'http://10.0.2.2:3000/api'; // 10.0.2.2 = localhost no emulador Android

// Estilo de mapa MapLibre usando tiles OSM.
// Em produção troque por um provedor de tiles OSM próprio (ex: seu servidor
// TileServer GL) ou um serviço como MapTiler/Protomaps.
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Intervalo de envio de telemetria (ms)
export const TELEMETRY_INTERVAL_MS = 30000;

// Distância mínima de movimento para novo cálculo (metros)
export const GPS_DISTANCE_FILTER = 10;
