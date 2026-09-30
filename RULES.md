# Reglas de Atari-Go

Atari-Go (también llamado "Go de captura") es una variante simplificada del juego de Go pensada para aprender los conceptos básicos: libertades, capturas y autocaptura. Gana quien primero captura una cantidad determinada de piedras rivales.

## Objetivo

A diferencia del Go tradicional (que se gana por territorio), en Atari-Go **gana la primera persona en capturar la cantidad de piedras configurada para la sala** (`stonesToWin`). También se puede ganar si el rival se rinde o si se le agota el tiempo.

## Elementos del juego

- **Tablero**: cuadriculado, de 7x7, 9x9 o 13x13 intersecciones según la configuración de la sala.
- **Piedras**: negras y blancas. Juega primero negro, y los turnos se alternan.
- **Jugadas**: en cada turno, la persona coloca una piedra de su color en una intersección vacía. No se pueden mover piedras ya colocadas.

## Libertades

Cada piedra (o cadena de piedras del mismo color conectadas ortogonalmente, es decir arriba/abajo/izquierda/derecha) tiene **libertades**: las intersecciones vacías adyacentes a esa cadena.

- Una cadena con al menos una libertad permanece en el tablero.
- Una cadena sin libertades es **capturada** y se retira del tablero.

## Capturas

Después de colocar una piedra:

1. Se revisan las cadenas rivales adyacentes a la piedra recién jugada.
2. Si alguna de esas cadenas queda sin libertades, se captura completa (todas sus piedras se retiran del tablero).
3. Las capturas cuentan para el objetivo de victoria de quien jugó la piedra.

## Regla de autocaptura

No está permitido jugar una piedra que deje a la propia cadena sin libertades, **salvo que esa jugada capture al menos una cadena rival** (en cuyo caso las libertades que deja la captura vuelven a habilitar la jugada).

## Regla de Ko

Cuando está habilitada en la sala (`koRuleEnabled`), se aplica la **regla de Ko simple**: no se puede jugar una piedra que reproduzca exactamente la posición del tablero inmediatamente anterior a la última jugada propia. Esto evita capturas y recapturas infinitas en un mismo punto. Si la regla está deshabilitada para la sala, esta restricción no se aplica.

## Pasar turno

No está permitido pasar: en cada turno es obligatorio colocar una piedra.

## Reloj

Cada partida usa reloj tipo **Fischer** (tiempo base + incremento por jugada), según el preset configurado en la sala:

| Preset | Tiempo base | Incremento por jugada |
|---|---|---|
| fischer-1-3 | 1 minuto | +3 segundos |
| fischer-5-3 | 5 minutos | +3 segundos |
| fischer-10-5 | 10 minutos | +5 segundos |

Si a una persona se le agota el tiempo, pierde la partida por tiempo.

## Fin de la partida

Una partida termina, y hay una persona ganadora, cuando ocurre alguna de estas situaciones:

- **Captura**: alguien alcanza la cantidad de piedras capturadas requerida (`stonesToWin`) para esa sala.
- **Rendición**: una persona se rinde (`board:resign`); gana la otra persona.
- **Tiempo**: a una persona se le agota el reloj; gana la otra persona.
- **Sin jugadas posibles**: si a quien le toca jugar no le queda ningún lugar permitido donde colocar una piedra (todas las intersecciones vacías son autocaptura o, con Ko habilitado, repetirían la posición), pierde la partida; gana la otra persona.

## Modo torneo

Solo las salas de tipo "torneo" tienen equipos: el administrador define en cada sala torneo la lista de equipos que participan (nombre y avatar), y a cada jugador se le asigna automáticamente uno de ellos al entrar a la sala. La asignación reparte a los jugadores de una misma institución en distintos equipos de forma equilibrada: se elige el equipo con menos jugadores de su institución y, a igualdad, el que tenga menos jugadores en total. El jugador conserva ese equipo cada vez que vuelve a la sala. Las salas amistosas no tienen equipos.

En salas de tipo "torneo", dos jugadores del mismo equipo no pueden enfrentarse entre sí en un mismo tablero; quien intente sentarse en esa condición queda como espectador.
