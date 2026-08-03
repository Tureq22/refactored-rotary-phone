// Ajuste para o IP/domínio do seu backend.
// - Emulador Android: http://10.0.2.2:3000/api  (10.0.2.2 = localhost do PC)
// - Celular físico na mesma rede Wi-Fi: http://IP_DO_SEU_PC:3000/api
// - Produção: https://api.seudominio.com.br/api  (SEMPRE https)
export const API_URL = 'http://10.0.2.2:3000/api';

// Estilo de mapa MapLibre usando tiles OSM.
// Em produção troque por um provedor próprio (TileServer GL) ou MapTiler/Protomaps.
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Intervalo de envio de telemetria (ms)
export const TELEMETRY_INTERVAL_MS = 30000;

// Distância mínima de movimento para novo cálculo (metros)
export const GPS_DISTANCE_FILTER = 10;

// Tolerância padrão usada só até o backend informar a da frota
export const DEFAULT_TOLERANCE_M = 150;
