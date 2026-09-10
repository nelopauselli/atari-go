# Atari-Go Online

Plataforma multijugador de Atari-Go para torneo interescolar.

## Stack
- Backend: Node.js + Express + Socket.IO
- Base de datos: MongoDB (Mongoose)
- Frontend: Vue 3 (sin build step, vía ESM/CDN) + Material Design claro

## Instalación

```bash
npm install
cp .env.example .env   # ajustar MONGODB_URI si hace falta
npm start
```

Servidor por defecto en `http://localhost:3000`.

Si no hay ningún Dojo cargado en la base, se crea automáticamente
**"Dojo Tierra"** al iniciar.

## Estructura

```
server/
  index.js              # entrypoint (Express + Socket.IO + Mongo)
  config/db.js
  models/                Dojo, Room, Match (Mongoose)
  game/                  atariGoEngine.js (reglas Go/capturas), clock.js (fischer/absoluto)
  managers/
    dojoManager.js
    roomManager.js
    matchManager.js      # única fuente de verdad de partidas activas
  routes/api.js           REST: /api/dojos /api/rooms /api/history
  sockets/index.js        eventos en tiempo real

public/
  index.html
  css/style.css
  js/app.js, api.js, socket.js
  js/components/          LoginScreen, Lobby, RoomView, MatchView, Goban
```

## Arquitectura de partidas (matchManager)

Toda creación y mutación de una `Partida` pasa exclusivamente por
`server/managers/matchManager.js`. Existe una única instancia en memoria
(`MatchState`, con su documento Mongoose embebido) por partida activa,
indexada por `matchId` y por tablero (`roomId:boardNumber`). Ningún otro
módulo llama `Match.create`, `Match.findByIdAndUpdate` ni `doc.save()`
directamente — así se evita que quede una copia vieja "congelada" en
memoria mientras Mongo ya tiene el estado real.
