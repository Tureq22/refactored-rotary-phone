import AsyncStorage from '@react-native-async-storage/async-storage';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MAP_STYLE_URL } from '../config';

const ROUTE_KEY = 'cached_route';

// Salva a rota localmente para uso offline
export async function cacheRoute(route) {
  await AsyncStorage.setItem(ROUTE_KEY, JSON.stringify(route));
}

export async function getCachedRoute() {
  const raw = await AsyncStorage.getItem(ROUTE_KEY);
  return raw ? JSON.parse(raw) : null;
}

// Pré-download dos tiles do mapa da região da rota (bbox), antes da viagem.
// bbox = [minLng, minLat, maxLng, maxLat]
export async function downloadTiles(bbox, routeId, onProgress) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const packName = `route_${routeId}`;

  // remove pacote antigo com o mesmo nome, se existir
  try {
    await MapLibreGL.offlineManager.deletePack(packName);
  } catch (_) {}

  await MapLibreGL.offlineManager.createPack(
    {
      name: packName,
      styleURL: MAP_STYLE_URL,
      minZoom: 8,
      maxZoom: 16,
      bounds: [
        [minLng, minLat], // sudoeste
        [maxLng, maxLat], // nordeste
      ],
    },
    (pack, status) => {
      if (onProgress) onProgress(status.percentage);
    },
    (pack, err) => {
      console.warn('Erro no download de tiles:', err);
    }
  );
}
