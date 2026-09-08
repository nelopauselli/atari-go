# Atari-Go Online

Backend en Node.js (Express + Socket.io) que arbitra la partida, un cliente
web hecho con **Vue 3** (sin build step, cargado por CDN) que se conecta
por WebSocket, y MongoDB para guardar cada partida jugada.

## Conceptos

- **Sala**: el código de 4 caracteres que usan dos personas para
  encontrarse y jugar en vivo. Vive en memoria del servidor mientras hay
  gente conectada.
- **Partida**: cada juego completo jugado dentro de una sala (desde que
  arranca hasta que termina por captura, rendición o empate). Cada partida
  se guarda en MongoDB apenas se crea y se va actualizando jugada a jugada,
  así sobrevive a un reinicio del servidor.

## Correrlo en tu máquina

Necesitás Node.js y una instancia de MongoDB accesible (local o en la nube,
ej. MongoDB Atlas).

```bash
npm install
export MONGODB_URI="mongodb://127.0.0.1:27017"   # o tu connection string de Atlas
export MONGODB_DB="atarigo"                       # opcional, este es el default
npm start
```

Si no configurás `MONGODB_URI`, el servidor intenta conectarse a
`mongodb://127.0.0.1:27017` por defecto. Si no encuentra Mongo, el juego
sigue funcionando en vivo con normalidad — simplemente no va a guardar
historial ni permitir descargar SGF de partidas ya guardadas (verás un
aviso en la consola del servidor).

Abrí `http://localhost:3000` en dos pestañas (o en dos computadoras de la
misma red usando tu IP local) para probarlo con dos jugadores.

## Cómo se juega

1. Un jugador crea la sala eligiendo tamaño de tablero, piedras necesarias
   para ganar, y opcionalmente un reloj (Fischer 5m+10s, Fischer 10m+5s,
   Absoluto 10m, o sin reloj). Recibe un código de 4 caracteres. Esto
   guarda la partida #1 de esa sala en MongoDB.
2. Alternativamente, cualquiera que entre a la webapp sin código ve
   primero un listado de "Salas activas": arriba las que están
   "Esperando rival" (podés sumarte con un clic), y debajo las
   "Partidas en curso" (o recién terminadas, esperando revancha), a las
   que te podés sumar como espectador con "Ver como espectador". La lista
   se actualiza sola (por WebSocket) a medida que cambia el estado de
   cada sala. Tiene un buscador por código para filtrarla, que además
   sirve para pedir "Mirar sala X" directamente si esa sala no aparece
   en ninguna de las dos listas.
3. El servidor valida cada jugada (capturas, jugadas suicidas), sincroniza
   el tablero a ambos jugadores, y guarda cada jugada en MongoDB.
4. Si alguien más se conecta a una sala llena, entra como espectador. Con
   el botón "Solo mirar" (o un link `?watch=CODIGO`) cualquiera puede
   sumarse a mirar sin ocupar el lugar de un jugador.
5. Cualquiera de los dos jugadores puede rendirse en cualquier momento con
   "Rendirse" (pide confirmación), lo que le da la victoria al rival.
6. Al terminar una partida (por captura, rendición, tiempo agotado o
   empate), los jugadores ven un botón "Jugar revancha en esta sala":
   arranca una partida nueva (#2, #3, ...) en la misma sala, con el mismo
   reloj configurado y **los colores invertidos** (quien jugó con Negro
   pasa a Blanco y viceversa), sin perder el registro de las anteriores.
7. Si la sala tiene reloj, el servidor es quien lo controla (no el
   navegador de cada jugador) — descuenta el tiempo real usado en cada
   jugada, aplica el incremento Fischer cuando corresponde, y si a
   alguien se le acaba el tiempo, pierde la partida automáticamente
   aunque no haga ningún movimiento (chequeo cada 1 segundo en el
   servidor). El reloj se pausa solo si alguno de los dos jugadores se
   desconecta, y se reanuda cuando ambos vuelven a estar presentes.
8. El historial **no vive dentro de la sala** — es una vista propia
   ("Historial de partidas" en la barra de navegación de arriba,
   accesible siempre, sin necesidad de tener o recordar un código de
   sala). Lista las últimas partidas jugadas en todo el servidor
   (paginadas de a 10), con opción de filtrar por código de sala si lo
   tenés. Cada partida tiene "Ver partida" (abre el visor de reproducción
   jugada por jugada) y "Descargar SGF".

## Estructura del proyecto

```
atari-go-online/
├── server.js              # punto de entrada: arma Express + Socket.io y arranca
├── lib/
│   ├── go-rules.js         # reglas del tablero (libertades, capturas, jugada válida)
│   ├── clock.js            # opciones de reloj y toda la aritmética de tiempo
│   ├── sgf.js               # generación de archivos SGF
│   ├── persistence.js       # conexión a MongoDB y guardado de partidas
│   ├── rooms.js              # estado de las salas en memoria
│   └── sockets.js            # todos los handlers de Socket.io (usa los anteriores)
├── routes/
│   └── partidas.js            # endpoints REST del historial (/api/partidas...)
└── public/
    ├── index.html               # markup, sin estilos ni lógica embebidos
    ├── style.css                 # todos los estilos
    └── js/
        ├── app.js                  # app raíz de Vue (estado, sockets, historial)
        ├── atari-board.js          # componente del tablero SVG
        └── go-replay.js            # recalcula capturas para reproducir partidas guardadas
```

El cliente usa módulos ES nativos del navegador (`<script type="module">`,
`import`/`export`) — no hace falta bundler tampoco ahí.

## Notas técnicas

- El reloj es autoritativo del servidor: cada sala guarda el tiempo
  restante de cada color en milisegundos, más una marca de cuándo
  arrancó a correr el turno actual. El cliente solo calcula localmente
  (cada 250ms) cuánto mostrar, restando ese instante contra la hora
  actual — así el conteo se ve fluido sin pedirle nada al servidor, pero
  quien decide si a alguien se le acabó el tiempo es siempre el
  servidor. Esto evita que alguien pueda "hacer trampa" manipulando el
  reloj de su propio navegador.

- El frontend está hecho en **Vue 3** (Composition API), cargado desde
  `unpkg.com` directo en el HTML — no hay paso de build, ni npm para el
  cliente, ni bundler. Todo el estado del juego vive en un objeto
  reactivo (`state`) que se actualiza cada vez que llega un evento
  `state` del servidor, y la UI se re-renderiza sola. El tablero está en
  un componente reutilizable (`AtariBoard`) que usan tanto el juego en
  vivo como el visor de reproducción del historial.
- El tablero "en vivo" de cada sala vive en memoria del servidor para que
  las jugadas sean instantáneas; la persistencia en MongoDB es best-effort
  (se actualiza en cada jugada, pero si Mongo está caído el juego no se
  interrumpe).
- Las salas vacías se manejan distinto según si llegaron a completarse
  alguna vez. Si una sala **nunca encontró un segundo jugador** y quien la
  creó se va, se cancela al instante (no queda listada ni en "Salas
  activas" ni en el historial — se borra también la partida vacía de
  MongoDB, ya que no tiene ninguna jugada). Si la partida **ya había
  arrancado** (los dos jugadores llegaron a estar presentes) y de golpe
  se queda sin nadie, se le da un margen de 60 segundos antes de
  eliminarla de la memoria, por si alguien se reconecta — eso no borra
  nada de MongoDB, solo la sesión en vivo.
- Para producción con múltiples instancias del servidor, la sala en
  memoria tendría que resolverse con el adaptador de Redis de Socket.io
  (el historial en MongoDB ya es compartible entre instancias tal cual).
