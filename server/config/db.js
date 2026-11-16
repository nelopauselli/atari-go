const mongoose = require('mongoose');

// Pool de conexiones a Mongo. Node atiende todo en un solo hilo y las consultas tardan
// microsegundos en Mongo: muchas conexiones no aceleran nada y, si el proceso se traba,
// el pool solo crece (por defecto hasta 100 y no se achica nunca).
const MAX_POOL_SIZE = Number(process.env.MONGO_MAX_POOL_SIZE) || 20;
// Las conexiones ociosas se cierran pasado este tiempo, así el pool vuelve a achicarse tras un pico.
const MAX_IDLE_TIME_MS = 60_000;
// Cada cuánto se informa el uso del pool (solo si hubo espera o cambió la cantidad de conexiones).
const POOL_REPORT_MS = 30_000;

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/atari-go';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { maxPoolSize: MAX_POOL_SIZE, maxIdleTimeMS: MAX_IDLE_TIME_MS });
  console.log(`[db] Conectado a MongoDB (pool máx. ${MAX_POOL_SIZE})`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] Error de conexión:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB desconectado');
  });

  monitorPool(mongoose.connection.getClient());
}

/**
 * Resume periódicamente el uso del pool a partir de los eventos del driver: conexiones
 * abiertas, cuántas consultas llegaron a esperar una conexión libre a la vez y la espera
 * más larga. No loguea nada mientras no haya espera ni cambios.
 */
function monitorPool(client) {
  let open = 0;
  let inUse = 0;
  let waiting = 0;
  let created = 0;
  let closed = 0;
  let maxInUse = 0;
  let maxWaiting = 0;
  let maxWaitMs = 0;
  let failed = 0;
  const waitStarts = [];

  client.on('connectionCreated', () => { open += 1; created += 1; });
  client.on('connectionClosed', () => { open = Math.max(0, open - 1); closed += 1; });
  client.on('connectionCheckOutStarted', () => {
    waiting += 1;
    maxWaiting = Math.max(maxWaiting, waiting);
    waitStarts.push(Date.now());
  });
  const endWait = () => {
    waiting = Math.max(0, waiting - 1);
    const start = waitStarts.shift();
    if (start != null) maxWaitMs = Math.max(maxWaitMs, Date.now() - start);
  };
  client.on('connectionCheckedOut', () => {
    endWait();
    inUse += 1;
    maxInUse = Math.max(maxInUse, inUse);
  });
  client.on('connectionCheckOutFailed', () => { endWait(); failed += 1; });
  client.on('connectionCheckedIn', () => { inUse = Math.max(0, inUse - 1); });

  const timer = setInterval(() => {
    // Una consulta "espera" desde que pide conexión hasta que la obtiene; con conexiones
    // libres eso es inmediato. Solo se informa si alguna esperó de verdad o cambió el pool.
    if (maxWaitMs >= 50 || created || closed || failed) {
      console.log(`[db] pool: ${open} abiertas (+${created} -${closed}), máx. en uso ${maxInUse}/${MAX_POOL_SIZE}, `
        + `máx. esperando ${maxWaiting}, espera máx. ${maxWaitMs} ms${failed ? `, ${failed} fallidas` : ''}`);
    }
    created = 0;
    closed = 0;
    failed = 0;
    maxInUse = inUse;
    maxWaiting = waiting;
    maxWaitMs = 0;
  }, POOL_REPORT_MS);
  timer.unref();
}

module.exports = { connectDB };
