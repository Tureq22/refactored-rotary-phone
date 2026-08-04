import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Fila offline de pings de telemetria.
//
// Quando o POST /telemetry/ping falha (sem rede), o ping é
// guardado aqui com o timestamp REAL da captura (recorded_at).
// Assim que a conexão volta, flushQueue() envia tudo em lotes
// para POST /telemetry/ping/batch e o histórico fica completo.
// ============================================================

const QUEUE_KEY = 'ping_queue_v1';
const MAX_QUEUE = 5000; // ~41h de viagem com ping a cada 30s
const BATCH_SIZE = 200; // pings por requisição de sincronização

let flushing = false; // trava para não rodar dois flushes ao mesmo tempo

async function readQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Adiciona um ping à fila. Retorna o tamanho atual da fila.
// ping = { route_id, lat, lng, speed, heading, recorded_at }
export async function enqueuePing(ping) {
  const queue = await readQueue();
  queue.push(ping);
  // fila cheia: descarta os mais antigos para não estourar o storage
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  await writeQueue(queue);
  return queue.length;
}

export async function getQueueCount() {
  const queue = await readQueue();
  return queue.length;
}

// Envia a fila em lotes. Retorna { flushed, remaining }.
// Se a rede cair no meio, o que já foi confirmado sai da fila e o
// resto permanece para a próxima tentativa.
export async function flushQueue(api) {
  if (flushing) return { flushed: 0, remaining: await getQueueCount() };
  flushing = true;
  let flushed = 0;
  try {
    for (;;) {
      const queue = await readQueue();
      if (queue.length === 0) break;

      // agrupa um lote de pings da MESMA rota (normalmente é uma só)
      const routeId = queue[0].route_id;
      const batch = [];
      const rest = [];
      for (const p of queue) {
        if (p.route_id === routeId && batch.length < BATCH_SIZE) batch.push(p);
        else rest.push(p);
      }

      try {
        await api.post('/telemetry/ping/batch', {
          route_id: routeId,
          pings: batch.map(({ route_id, ...p }) => p),
        });
        // confirmado: remove o lote da fila
        await writeQueue(rest);
        flushed += batch.length;
      } catch (err) {
        const status = err?.response?.status;
        // 4xx (exceto 401/408/429) = lote "envenenado" (ex.: rota apagada).
        // Descarta para não travar a fila para sempre.
        if (status >= 400 && status < 500 && ![401, 408, 429].includes(status)) {
          console.warn('Lote de pings descartado pelo servidor:', status);
          await writeQueue(rest);
          continue;
        }
        // sem rede / 5xx / token expirado: para e tenta depois
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, remaining: await getQueueCount() };
}
