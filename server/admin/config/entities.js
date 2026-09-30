const Player = require('../../models/Player');
const Room = require('../../models/Room');
const Match = require('../../models/Match');
const Institution = require('../../models/Institution');

// Metadata que describe cómo listar/editar cada modelo desde el panel admin.
// `type` de cada campo controla el input generado en el frontend: string, number,
// boolean, date, color, image (data URL), enum (usa `options`), ref (usa `ref` = key de otra entidad),
// refs (varias referencias a otra entidad), items (array de sub-registros cuyos campos string/image
// se describen en `fields`), list (array de strings, uno por línea) o password (nunca se devuelve; se guarda hasheado con
// `model.hashPassword` y si se deja vacío al editar se conserva la actual).
// `showIf` = { campo: valor } muestra el campo solo en ese caso.
// `sort` (opcional) = orden del listado; por defecto, los más nuevos primero.
module.exports = {
  institutions: {
    label: 'Instituciones',
    model: Institution,
    sort: { order: 1, name: 1 },
    fields: [
      { name: 'name', label: 'Nombre', type: 'string', required: true },
      { name: 'order', label: 'Orden', type: 'number', default: 0 },
      { name: 'password', label: 'Contraseña', type: 'password', required: true },
      { name: 'users', label: 'Usuarios', type: 'list' },
      { name: 'createdAt', label: 'Creado', type: 'date', readonly: true },
    ],
  },
  players: {
    label: 'Jugadores',
    model: Player,
    // Se crean solos al iniciar sesión (la lista de habilitados está en cada institución):
    // acá solo se consultan/eliminan.
    readonly: true,
    fields: [
      { name: 'nickname', label: 'Apodo', type: 'string', required: true },
      { name: 'institution', label: 'Institución', type: 'ref', ref: 'institutions' },
      { name: 'lastSeenAt', label: 'Última conexión', type: 'date' },
    ],
  },
  rooms: {
    label: 'Salas',
    model: Room,
    fields: [
      { name: 'name', label: 'Nombre', type: 'string', required: true },
      { name: 'type', label: 'Tipo', type: 'enum', options: ['torneo', 'amistosas'], required: true },
      { name: 'boardCount', label: 'Cant. de tableros', type: 'number', required: true },
      { name: 'boardSize', label: 'Tamaño de tablero', type: 'enum', options: [7, 9, 13], required: true },
      { name: 'stonesToWin', label: 'Piedras para ganar', type: 'number', required: true },
      {
        name: 'clockType',
        label: 'Reloj',
        type: 'enum',
        options: ['fischer-1-3', 'fischer-5-3', 'fischer-10-5'],
        required: true,
      },
      { name: 'koRuleEnabled', label: 'Regla de Ko', type: 'boolean', default: true },
      {
        name: 'teams',
        label: 'Equipos',
        type: 'items',
        itemLabel: 'equipo',
        showIf: { type: 'torneo' },
        fields: [
          { name: 'name', label: 'Nombre', type: 'string', required: true },
          { name: 'avatar', label: 'Avatar', type: 'image' },
        ],
      },
      { name: 'closed', label: 'Cerrada', type: 'boolean' },
    ],
  },
  matches: {
    label: 'Partidas',
    model: Match,
    readonly: true, // partidas jugadas: se consultan/eliminan del historial, no se editan a mano
    fields: [
      { name: 'roomName', label: 'Sala', type: 'string' },
      { name: 'boardNumber', label: 'Tablero', type: 'number' },
      { name: 'boardSize', label: 'Tamaño', type: 'number' },
      { name: 'koRuleEnabled', label: 'Regla de Ko', type: 'boolean' },
      { name: 'status', label: 'Estado', type: 'string' },
      { name: 'capturedByBlack', label: 'Capturadas (negro)', type: 'number' },
      { name: 'capturedByWhite', label: 'Capturadas (blanco)', type: 'number' },
      { name: 'startedAt', label: 'Inicio', type: 'date' },
      { name: 'endedAt', label: 'Fin', type: 'date' },
    ],
  },
};
