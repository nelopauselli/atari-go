# Atari-Go Online

Backend en Node.js (Express + Socket.io) que arbitra la partida, un cliente
web que se conecta por WebSocket, y MongoDB para guardar cada partida
jugada.

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

1. Un jugador crea la sala eligiendo tamaño de tablero y piedras necesarias
   para ganar. Recibe un código de 4 caracteres. Esto guarda la partida #1
   de esa sala en MongoDB.
2. Comparte el código con el rival, que lo ingresa en "Unirse a una sala".
3. El servidor valida cada jugada (capturas, jugadas suicidas), sincroniza
   el tablero a ambos jugadores, y guarda cada jugada en MongoDB.
4. Si alguien más se conecta a una sala llena, entra como espectador. Con
   el botón "Solo mirar" (o un link `?watch=CODIGO`) cualquiera puede
   sumarse a mirar sin ocupar el lugar de un jugador.
5. Cualquiera de los dos jugadores puede rendirse en cualquier momento con
   "Rendirse" (pide confirmación), lo que le da la victoria al rival.
6. Al terminar una partida (por captura, rendición o empate), los
   jugadores ven un botón "Jugar revancha en esta sala": arranca una
   partida nueva (#2, #3, ...) en la misma sala, sin perder el registro de
   las anteriores.
7. Debajo del tablero hay un panel "Historial de partidas en esta sala"
   con todas las partidas jugadas (en curso o terminadas), su resultado y
   un link de descarga en formato SGF para cada una — el estándar
   universal de archivos de Go, abrible con Sabaki, CGoban, OGS, etc.

## Notas técnicas

- El tablero "en vivo" de cada sala vive en memoria del servidor para que
  las jugadas sean instantáneas; la persistencia en MongoDB es best-effort
  (se actualiza en cada jugada, pero si Mongo está caído el juego no se
  interrumpe).
- Las salas vacías (sin jugadores conectados) se eliminan de la memoria
  después de un minuto — esto no borra nada de MongoDB, solo la sesión en
  vivo. El código de sala podría reutilizarse más adelante para otra sala
  distinta, así que el historial se consulta por código + fecha, no hay
  que asumir que un código pertenece para siempre a la misma sala.
- Para producción con múltiples instancias del servidor, la sala en
  memoria tendría que resolverse con el adaptador de Redis de Socket.io
  (el historial en MongoDB ya es compartible entre instancias tal cual).
