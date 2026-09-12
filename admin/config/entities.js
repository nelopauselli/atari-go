const Team = require('../../models/Team');
const Player = require('../../models/Player');
const Room = require('../../models/Room');
const Match = require('../../models/Match');

// Metadata que describe cómo listar/editar cada modelo desde el panel admin.
// `type` de cada campo controla el input generado en el frontend: string, number,
// boolean, date, color, enum (usa `options`) o ref (usa `ref` = key de otra entidad).
module.exports = {
  teams: {
    label: 'Equipos',
    model: Team,
    fields: [
      { name: 'name', label: 'Nombre', type: 'string', required: true },
      { name: 'color', label: 'Color', type: 'color' },
      { name: 'createdAt', label: 'Creado', type: 'date', readonly: true },
    ],
  },
  players: {
    label: 'Jugadores',
    model: Player,
    fields: [
      { name: 'nickname', label: 'Apodo', type: 'string', required: true },
      { name: 'team', label: 'Equipo', type: 'ref', ref: 'teams', required: true },
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
      { name: 'status', label: 'Estado', type: 'string' },
      { name: 'capturedByBlack', label: 'Capturadas (negro)', type: 'number' },
      { name: 'capturedByWhite', label: 'Capturadas (blanco)', type: 'number' },
      { name: 'startedAt', label: 'Inicio', type: 'date' },
      { name: 'endedAt', label: 'Fin', type: 'date' },
    ],
  },
};
