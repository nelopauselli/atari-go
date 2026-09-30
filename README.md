# Atari-Go Online

App web multijugador en tiempo real para Atari-Go (Node.js + Express + Socket.io + MongoDB + Vue 3 sin build step).

## Instalación

```bash
npm install
cp .env.example .env   # ajustar MONGO_URI si hace falta
npm start
```

Servidor en `http://localhost:3000`. Requiere una instancia de MongoDB accesible (local o remota) vía `MONGO_URI`.

### Panel de administración

Lo sirve el mismo servidor en `http://localhost:3000/admin/`, protegido con HTTP Basic Auth. Las credenciales se definen en `.env`:

```
ADMIN_USER=admin
ADMIN_PASSWORD=una-contraseña-larga
```

Si alguna de las dos falta, el panel no se monta. En producción tiene que ir detrás de HTTPS (Basic Auth manda la contraseña en base64). Permite listar, crear, editar y borrar los registros de `server/models/` (instituciones, jugadores y salas —con sus equipos—; las partidas son de solo lectura). Los cambios en salas se reflejan al instante en las salas en memoria.

## Estructura

- `server/` – todo el código de la app: bootstrap (conexión a Mongo, migraciones, Express + Socket.io) y las carpetas de abajo.
- `server/admin/` – panel administrativo (router Express + frontend Vue 3 sin build step) para gestionar las entidades de `server/models/`, montado en `/admin`.
- `server/middleware/adminAuth.js` – Basic Auth del panel.
- `server/config/db.js` – conexión Mongoose.
- `server/models/` – Institution, Player, Room (con sus equipos), Match (Mongoose).

### Instituciones y login

Cada institución tiene una lista de usuarios (nicknames) y una contraseña compartida, que se guarda hasheada (scrypt). Para ingresar al juego hay que elegir la institución, poner un usuario que figure en su lista, y la contraseña de la institución. El equipo no se elige en el login: solo las salas torneo tienen equipos (cada sala define desde el panel su lista de equipos, con nombre y avatar) y al entrar a la sala se le asigna uno automáticamente, repartiendo a los jugadores de una misma institución entre los distintos equipos de forma equilibrada. Se administran desde el panel (al editar, dejar la contraseña vacía conserva la actual).
- `services/goEngine.js` – reglas de Go (capturas, libertades, ko simple).
- `services/matchManager.js` – **única fuente de verdad** del estado en memoria de salas/tableros/partidas. Toda mutación de partidas pasa por acá; los handlers de sockets nunca tocan Mongo directamente. Expone `setBroadcastHandler`.
- `services/sgf.js` – exportación de partidas a formato SGF.
- `sockets/index.js` – handlers de Socket.io, delegan a `matchManager`.
- `routes/` – REST: instituciones, login de jugador, salas, historial + descarga SGF.
- `public/` – frontend Vue 3 (ESM vía CDN, sin build step), Material Design.

## Eventos de Socket.io

| Evento (cliente → servidor) | Payload |
|---|---|
| `room:join` | `{ roomId, player }` |
| `room:leave` | `{ roomId }` |
| `board:sit` | `{ roomId, boardNumber, player }` — siempre se emite, el backend decide jugador/espectador (en torneo usa el equipo asignado en `room:join`) |
| `board:move` | `{ roomId, boardNumber, playerId, x, y }` |
| `board:resign` | `{ roomId, boardNumber, playerId }` |
| `board:leaveSpectator` | `{ roomId, boardNumber }` |

| Evento (servidor → sala) | Payload |
|---|---|
| `room:update` | resumen de tableros de la sala (orden: esperando rival, vacíos, en curso, finalizados) |
| `board:state` | snapshot completo del tablero tras una jugada |
| `board:clock` | tick de reloj cada 1s |
| `board:finished` | resultado final de una partida |
