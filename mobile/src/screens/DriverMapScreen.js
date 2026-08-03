import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, PermissionsAndroid } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import Geolocation from 'react-native-geolocation-service';

import { api } from '../services/api';
import { getCachedRoute, cacheRoute, downloadTiles } from '../services/offline';
import { evaluatePosition } from '../services/geofence';
import { triggerDeviationAlert, initAlertSound } from '../services/alert';
import { MAP_STYLE_URL, TELEMETRY_INTERVAL_MS, GPS_DISTANCE_FILTER, DEFAULT_TOLERANCE_M } from '../config';

export default function DriverMapScreen() {
  const [route, setRoute] = useState(null);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE_M);
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState({ distanceM: 0, offRoute: false });
  const [downloadPct, setDownloadPct] = useState(null);

  const watchId = useRef(null);
  const lastPingRef = useRef(0);
  // Ref evita o bug de "closure velha": o watchPosition captura o valor
  // de `tolerance` do momento em que foi criado. Com a ref, o callback
  // sempre lê o valor mais atual (ex.: admin mudou a tolerância da frota).
  const toleranceRef = useRef(DEFAULT_TOLERANCE_M);

  useEffect(() => {
    initAlertSound();
    bootstrap();
    return () => {
      if (watchId.current != null) Geolocation.clearWatch(watchId.current);
    };
  }, []);

  function applyTolerance(t) {
    if (typeof t === 'number' && t > 0) {
      toleranceRef.current = t;
      setTolerance(t);
    }
  }

  async function requestPermission() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    const auth = await Geolocation.requestAuthorization('whenInUse');
    return auth === 'granted';
  }

  async function bootstrap() {
    const ok = await requestPermission();
    if (!ok) return Alert.alert('Permissão negada', 'O app precisa de acesso ao GPS.');

    // tenta buscar rota online; se falhar, usa cache offline
    let r = null;
    try {
      const { data } = await api.get('/routes/mine');
      r = data;
      applyTolerance(r.tolerance_m); // backend agora envia a tolerância da frota
      await cacheRoute(r);
      // pré-download de tiles da região
      if (r.bbox) {
        downloadTiles(r.bbox, r.id, (p) => setDownloadPct(Math.round(p)));
      }
    } catch (e) {
      r = await getCachedRoute();
      if (!r) return Alert.alert('Sem rota', 'Nenhuma rota disponível (online ou offline).');
      applyTolerance(r.tolerance_m);
    }
    setRoute(r);
    startTracking(r);
  }

  function startTracking(r) {
    watchId.current = Geolocation.watchPosition(
      (p) => {
        const coord = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(coord);

        // Geofencing linear local (alerta imediato) — lê tolerância da ref
        const evalRes = evaluatePosition(r.geometry, coord, toleranceRef.current);
        setStatus(evalRes);
        if (evalRes.offRoute) triggerDeviationAlert();

        // Telemetria periódica pro backend
        const now = Date.now();
        if (now - lastPingRef.current >= TELEMETRY_INTERVAL_MS) {
          lastPingRef.current = now;
          sendPing(r.id, coord, p.coords);
        }
      },
      (err) => console.warn('GPS error', err),
      {
        enableHighAccuracy: true,
        distanceFilter: GPS_DISTANCE_FILTER,
        interval: 5000,
        fastestInterval: 3000,
      }
    );
  }

  async function sendPing(routeId, coord, coords) {
    try {
      const { data } = await api.post('/telemetry/ping', {
        route_id: routeId,
        lat: coord.lat,
        lng: coord.lng,
        speed: coords.speed,
        heading: coords.heading,
      });
      // sincroniza tolerância caso o admin tenha mudado no backend
      applyTolerance(data.tolerance_m);
    } catch (_) {
      // offline: ping é descartado (poderia enfileirar em AsyncStorage se necessário)
    }
  }

  async function reportStop() {
    if (!pos || !route) return;
    try {
      await api.post('/telemetry/stop', { route_id: route.id, lat: pos.lat, lng: pos.lng });
      Alert.alert('Parada registrada');
    } catch (_) {
      Alert.alert('Sem conexão', 'Não foi possível registrar agora.');
    }
  }

  async function justifyDeviation() {
    if (!pos || !route) return;
    try {
      await api.post('/telemetry/deviation', {
        route_id: route.id,
        lat: pos.lat,
        lng: pos.lng,
        distance_m: Math.round(status.distanceM),
        reason: 'Desvio sinalizado pelo motorista',
      });
      Alert.alert('Enviado', 'Justificativa enviada ao supervisor.');
    } catch (_) {
      Alert.alert('Sem conexão');
    }
  }

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView style={styles.map} styleURL={MAP_STYLE_URL}>
        <MapLibreGL.Camera
          zoomLevel={14}
          centerCoordinate={pos ? [pos.lng, pos.lat] : [-48.845, -26.30]}
          followUserLocation={!!pos}
        />

        {/* Rota travada desenhada como linha fixa */}
        {route && (
          <MapLibreGL.ShapeSource id="route" shape={route.geometry}>
            <MapLibreGL.LineLayer
              id="routeLine"
              style={{ lineColor: '#2563eb', lineWidth: 5, lineCap: 'round', lineJoin: 'round' }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* Marcador do caminhão */}
        {pos && (
          <MapLibreGL.PointAnnotation id="truck" coordinate={[pos.lng, pos.lat]}>
            <View style={[styles.truck, status.offRoute && styles.truckOff]} />
          </MapLibreGL.PointAnnotation>
        )}
      </MapLibreGL.MapView>

      {/* Painel de status */}
      <View style={[styles.panel, status.offRoute && styles.panelAlert]}>
        <Text style={styles.panelTitle}>
          {status.offRoute ? '⚠️ FORA DA ROTA' : '✅ Na rota'}
        </Text>
        <Text style={styles.panelText}>
          Distância da linha: {Math.round(status.distanceM)} m (tol. {tolerance} m)
        </Text>
        {downloadPct != null && downloadPct < 100 && (
          <Text style={styles.panelText}>Baixando mapa offline: {downloadPct}%</Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={reportStop}>
          <Text style={styles.btnText}>Sinalizar parada</Text>
        </TouchableOpacity>
        {status.offRoute && (
          <TouchableOpacity style={[styles.btn, styles.btnWarn]} onPress={justifyDeviation}>
            <Text style={styles.btnText}>Justificar desvio</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  truck: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#22c55e', borderWidth: 3, borderColor: '#fff' },
  truckOff: { backgroundColor: '#ef4444' },
  panel: { position: 'absolute', top: 40, left: 12, right: 12, backgroundColor: 'rgba(15,23,42,0.9)', padding: 14, borderRadius: 12 },
  panelAlert: { backgroundColor: 'rgba(239,68,68,0.95)' },
  panelTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  panelText: { color: '#e2e8f0', marginTop: 4 },
  actions: { position: 'absolute', bottom: 30, left: 12, right: 12, flexDirection: 'row', gap: 10 },
  btn: { flex: 1, backgroundColor: '#334155', padding: 16, borderRadius: 12 },
  btnWarn: { backgroundColor: '#f59e0b' },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
});
