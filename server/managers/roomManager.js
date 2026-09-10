'use strict';

const Room = require('../models/Room');

/**
 * Presencia en memoria (no persiste en Mongo):
 * roomPresence: Map<roomIdString, Map<socketId, {nickname, dojoId, dojoName}>>
 */
const roomPresence = new Map();

function buildBoardSlots(boardsCount) {
  const boards = [];
  for (let i = 1; i <= boardsCount; i += 1) {
    boards.push({ number: i, status: 'free', matchId: null });
  }
  return boards;
}

async function createRoom({ name, boardsCount, stonesToCapture, boardSize, clockType, allowSameDojo }) {
  const room = await Room.create({
    name,
    boardsCount,
    stonesToCapture,
    boardSize,
    clockType,
    allowSameDojo,
    boards: buildBoardSlots(boardsCount),
  });
  return room;
}

async function listActiveRooms() {
  return Room.find({ active: true }).sort({ createdAt: -1 }).lean();
}

async function getRoomDoc(roomId) {
  return Room.findById(roomId);
}

async function getRoomLean(roomId) {
  return Room.findById(roomId).lean();
}

/**
 * Marca un tablero como ocupado por una partida. Se usa
 * exclusivamente desde matchManager para mantener consistencia.
 */
async function occupyBoard(roomId, boardNumber, matchId) {
  const room = await Room.findOneAndUpdate(
    { _id: roomId, 'boards.number': boardNumber },
    { $set: { 'boards.$.status': 'occupied', 'boards.$.matchId': matchId } },
    { new: true }
  );
  return room;
}

async function freeBoard(roomId, boardNumber) {
  const room = await Room.findOneAndUpdate(
    { _id: roomId, 'boards.number': boardNumber },
    { $set: { 'boards.$.status': 'free', 'boards.$.matchId': null } },
    { new: true }
  );
  return room;
}

// ---------- Presencia (jugadores/espectadores conectados a la sala) ----------

function ensureRoomPresence(roomId) {
  const key = String(roomId);
  if (!roomPresence.has(key)) roomPresence.set(key, new Map());
  return roomPresence.get(key);
}

function joinRoomPresence(roomId, socketId, playerInfo) {
  const presence = ensureRoomPresence(roomId);
  presence.set(socketId, playerInfo);
}

function leaveRoomPresence(roomId, socketId) {
  const key = String(roomId);
  const presence = roomPresence.get(key);
  if (!presence) return;
  presence.delete(socketId);
  if (presence.size === 0) roomPresence.delete(key);
}

function leaveAllRoomsPresence(socketId) {
  for (const [roomId, presence] of roomPresence.entries()) {
    if (presence.has(socketId)) presence.delete(socketId);
    if (presence.size === 0) roomPresence.delete(roomId);
  }
}

function getRoomPresenceList(roomId) {
  const presence = roomPresence.get(String(roomId));
  return presence ? Array.from(presence.values()) : [];
}

function getRoomStats(roomId) {
  const players = getRoomPresenceList(roomId);
  const dojoIds = new Set(players.map((p) => String(p.dojoId)));
  return {
    connectedPlayers: players.length,
    dojosCount: dojoIds.size,
  };
}

module.exports = {
  createRoom,
  listActiveRooms,
  getRoomDoc,
  getRoomLean,
  occupyBoard,
  freeBoard,
  joinRoomPresence,
  leaveRoomPresence,
  leaveAllRoomsPresence,
  getRoomPresenceList,
  getRoomStats,
};
