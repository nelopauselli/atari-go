# Atari-Go Online

Sitio para jugar Atari-Go multijugador en vivo: salas con tableros numerados,
partidas con reloj, capturas configurables por sala y modo espectador.

## Stack

- **Backend**: Node.js + Express + Socket.io + MongoDB (mongoose).
- **Frontend**: Vue 3 sin build step (import maps + CDN, `<script type="module">`).
- **Tiempo real**: Socket.io para jugadas, reloj y actualización de lobby.

## Cómo correrlo

```bash
npm install
cp .env.example .env     # ajustá MONGODB_URI si hace falta
# necesitás un MongoDB corriendo en local (o en la nube) apuntado por MONGODB_URI
npm start
```

Abrí `http://localhost:3000`.

> Nota: en este entorno de generación no tengo acceso a red para correr
> `npm install` ni levantar MongoDB, así que el motor de reglas de Go
> (`src/game/board.js`) fue probado de forma aislada con `node`, y el resto
> de los archivos fueron chequeados con `node --check`. Antes de production,
> corré `npm install && npm start` con un Mongo real y probá el flujo
> completo con dos pestañas.

## Dominio → código

| Concepto  | Dónde vive |
|---|---|
| Sala      | `models/Room.js` — nombre, tamaño de tablero, capturas para ganar, tipo de reloj, y su lista de `boards` (tableros numerados). |
| Tablero   | Subdocumento `boards[]` dentro de `Room`. Persiste entre partidas; al terminar una partida vuelve a `libre` para que otro par de jugadores lo use. |
| Jugador / Espectador | No hay cuentas: cada socket tiene un nombre (guardado en `localStorage`) y un rol (`player`/`spectator`) por partida. |
| Partida   | `models/Match.js` — tablero (grilla), jugadas, capturas, reloj embebido, estado y resultado. |
| Reloj     | `src/game/clock.js` — fischer (con incremento) o absoluto, con proyección de tiempo restante en tiempo real. |

## Decisiones de diseño (confirmadas con vos)

- El tamaño de tablero es elegible al crear la sala: **5×5, 7×7, 9×9 o 13×13**.
- Al terminar una partida, el tablero **queda libre** para que se siente
  otro par de jugadores (no hay revancha automática en el mismo tablero).

## Reglas de Go implementadas (`src/game/board.js`)

- Colocar piedra, detección y remoción de grupos rivales sin libertades
  (capturas).
- Regla de suicidio: una jugada que deja al grupo propio sin libertades es
  ilegal, salvo que capture algo.
- Regla de ko simple (un paso): no se puede repetir inmediatamente la
  posición que dejó la jugada anterior del rival.
- Fin de partida: por capturas alcanzando el objetivo de la sala, por
  bandera de tiempo caída, por renuncia, o por doble pase consecutivo
  (en ese caso gana quien tenga más capturas; empate si están iguales).

Está probado con un script rápido (captura en la esquina y suicidio
bloqueado); no incluye todavía un test runner formal — si querés lo sumo
con `node:test`.

## Eventos de socket

**Cliente → servidor**
- `room:enter` / `room:leave` — entrar/salir del lobby de una sala (para el contador de conectados).
- `board:create` — agregar un tablero numerado nuevo a la sala.
- `board:sit` `{ boardNumber, name }` — sentarse a jugar (negro si el tablero está libre, blanco si ya hay alguien esperando).
- `board:spectate` `{ matchId, name }` — mirar una partida.
- `match:rejoin` `{ matchId, color }` — recuperar el asiento tras recargar la página.
- `match:move` `{ matchId, row, col }`, `match:pass`, `match:resign`.

**Servidor → cliente**
- `lobby:update` — algo cambió en salas/partidas activas (el cliente refresca vía REST).
- `room:boards` — estado de los tableros de la sala actual.
- `match:waiting` / `match:started` / `match:state` / `match:over` — estado público de la partida.
- `match:clock` — tick liviano de reloj (cada 500ms).
- `match:spectators` — cambios en la cantidad de espectadores.

## API REST

- `GET /api/rooms`, `POST /api/rooms`, `GET /api/rooms/:id`, `GET /api/rooms/clock-presets`
- `GET /api/matches/active`, `GET /api/matches/history`, `GET /api/matches/:id`

## Qué falta / próximos pasos sugeridos

- Reconexión automática si se corta el socket a mitad de partida (hoy el
  reloj sigue corriendo, y `match:rejoin` permite retomar manualmente).
- Chat en la partida.
- Ranking / Elo por jugador (hoy no hay cuentas, así que no hay identidad persistente).
- Tests automatizados del motor de reglas con `node:test`.
