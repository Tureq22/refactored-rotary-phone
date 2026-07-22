import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { api } from '../services/api';
import { MAP_STYLE_URL } from '../config';

export default function SupervisorScreen() {
  const [live, setLive] = useState([]);
  const [deviations, setDeviations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([
        api.get('/telemetry/live'),
        api.get('/telemetry/deviations'),
      ]);
      setLive(l.data);
      setDeviations(d.data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // atualiza a cada 15s
    return () => clearInterval(t);
  }, [load]);

  async function review(id, status) {
    try {
      await api.patch(`/telemetry/deviation/${id}`, { status });
      load();
    } catch (_) {
      Alert.alert('Erro ao processar');
    }
  }

  const center = live[0] ? [live[0].lng, live[0].lat] : [-48.845, -26.30];

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView style={styles.map} styleURL={MAP_STYLE_URL}>
        <MapLibreGL.Camera zoomLevel={11} centerCoordinate={center} />
        {live.map((d) => (
          <MapLibreGL.PointAnnotation key={`d${d.driver_id}`} id={`d${d.driver_id}`} coordinate={[d.lng, d.lat]}>
            <View style={[styles.dot, d.off_route && styles.dotOff]} />
          </MapLibreGL.PointAnnotation>
        ))}
      </MapLibreGL.MapView>

      <View style={styles.list}>
        <Text style={styles.header}>Motoristas ao vivo ({live.length})</Text>
        <FlatList
          data={live}
          keyExtractor={(i) => String(i.driver_id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowName}>{item.driver_name}</Text>
              <Text style={[styles.badge, item.off_route ? styles.badgeOff : styles.badgeOk]}>
                {item.off_route ? `FORA ${Math.round(item.distance_m)}m` : 'OK'}
              </Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum motorista ativo.</Text>}
        />

        {deviations.length > 0 && (
          <>
            <Text style={styles.header}>Desvios p/ aprovar ({deviations.length})</Text>
            {deviations.map((dv) => (
              <View key={dv.id} style={styles.devRow}>
                <Text style={styles.rowName}>
                  {dv.driver_name} — {Math.round(dv.distance_m)}m
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.approve} onPress={() => review(dv.id, 'approved')}>
                    <Text style={styles.btnText}>Aprovar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.reject} onPress={() => review(dv.id, 'rejected')}>
                    <Text style={styles.btnText}>Rejeitar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  map: { height: '40%' },
  list: { flex: 1, padding: 12 },
  header: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginTop: 8, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  rowName: { color: '#e2e8f0', fontSize: 15 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, color: '#0f172a', fontWeight: 'bold', overflow: 'hidden' },
  badgeOk: { backgroundColor: '#22c55e' },
  badgeOff: { backgroundColor: '#ef4444', color: '#fff' },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' },
  dotOff: { backgroundColor: '#ef4444' },
  devRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  approve: { backgroundColor: '#22c55e', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  reject: { backgroundColor: '#ef4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  empty: { color: '#64748b', textAlign: 'center', padding: 20 },
});
