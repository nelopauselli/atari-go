# Atari-Go Online

Backend en Node.js (Express + Socket.io) que arbitra la partida, y un cliente
web que se conecta por WebSocket. Dos jugadores entran a la misma sala con un
código de 4 caracteres y juegan en tiempo real.

## Correrlo en tu máquina

```bash
npm install
npm start
```

Abrí `http://localhost:3000` en dos pestañas (o en dos computadoras de la
misma red usando tu IP local, ej. `http://192.168.0.5:3000`) para probarlo
con dos jugadores.

## Cómo se juega

1. Un jugador crea la sala eligiendo tamaño de tablero y piedras necesarias
   para ganar. Recibe un código de 4 caracteres.
2. Comparte el código con el rival, que lo ingresa en "Unirse a una sala".
3. El servidor valida cada jugada (capturas, jugadas suicidas) y sincroniza
   el tablero a ambos jugadores.
4. Si alguien más se conecta a una sala llena, entra como espectador.

## Desplegarlo online (para jugar entre distintas redes)

Este proyecto es un servidor Node.js normal, así que sirve cualquier hosting
que corra Node con WebSockets. Opciones simples con capa gratuita:

- **Render.com**: "New Web Service" → conectá el repo → build command
  `npm install`, start command `npm start`.
- **Railway.app**: "New Project" → "Deploy from GitHub repo" → detecta Node
  automáticamente.
- **Fly.io**: `fly launch` en la carpeta del proyecto (usa el `package.json`
  para detectar Node).

En cualquiera de estas plataformas no hace falta configurar nada especial:
Socket.io funciona sobre el mismo puerto HTTP (usa `process.env.PORT`, que
ya está contemplado en `server.js`).

## Notas técnicas

- El estado del juego (tablero, turno, capturas) vive en memoria del
  servidor por sala — si el proceso se reinicia, las partidas en curso se
  pierden. Para producción con múltiples instancias haría falta mover el
  estado a algo compartido (ej. Redis) y usar el adaptador de Redis de
  Socket.io.
- Las salas vacías (sin jugadores conectados) se eliminan automáticamente
  después de un minuto.
