// Cliente de Socket.IO compartido por toda la app.
// `io` es provisto globalmente por /socket.io/socket.io.js
export const socket = io({ autoConnect: true });

/** Emite un evento y espera el ack del servidor como una promesa. */
export function emitAck(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response && response.ok === false) {
        reject(new Error(response.error || 'Error desconocido'));
      } else {
        resolve(response);
      }
    });
  });
}
