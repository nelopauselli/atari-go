# Atari-Go Interescolar

App web multijugador en tiempo real para Atari-Go (Node.js + Express + Socket.io + MongoDB + Vue 3 sin build step).

## Instalación

```bash
npm install
cp .env.example .env   # ajustar MONGO_URI si hace falta
npm start
```

Servidor en `http://localhost:3000`. Requiere una instancia de MongoDB accesible (local o remota) vía `MONGO_URI`.

## Estructura

- `server.js` – bootstrap: conexión a Mongo, seed de equipos, Express + Socket.io.
- `config/db.js` – conexión Mongoose.
- `models/` – Team, Player, Room, Match (Mongoose).
- `services/goEngine.js` – reglas de Go (capturas, libertades, ko simple).
- `services/matchManager.js` – **única fuente de verdad** del estado en memoria de salas/tableros/partidas. Toda mutación de partidas pasa por acá; los handlers de sockets nunca tocan Mongo directamente. Expone `setBroadcastHandler`.
- `services/sgf.js` – exportación de partidas a formato SGF.
- `sockets/index.js` – handlers de Socket.io, delegan a `matchManager`.
- `routes/` – REST: equipos, login de jugador, salas, historial + descarga SGF.
- `seed/seedTeams.js` – siembra los 4 equipos fijos (Tierra, Agua, Aire, Fuego) al iniciar.
- `public/` – frontend Vue 3 (ESM vía CDN, sin build step), Material Design.

## Eventos de Socket.io

| Evento (cliente → servidor) | Payload |
|---|---|
| `room:join` | `{ roomId, player }` |
| `room:leave` | `{ roomId }` |
| `board:sit` | `{ roomId, boardNumber, player }` — siempre se emite, el backend decide jugador/espectador |
| `board:move` | `{ roomId, boardNumber, playerId, x, y, pass }` |
| `board:resign` | `{ roomId, boardNumber, playerId }` |
| `board:leaveSpectator` | `{ roomId, boardNumber }` |

| Evento (servidor → sala) | Payload |
|---|---|
| `room:update` | resumen de tableros de la sala (orden: esperando rival, vacíos, en curso, finalizados) |
| `board:state` | snapshot completo del tablero tras una jugada |
| `board:clock` | tick de reloj cada 1s |
| `board:finished` | resultado final de una partida |
