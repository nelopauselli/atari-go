const express = require('express');
const { getPartidasCollection, ObjectId } = require('../lib/persistence');
const { buildSgf } = require('../lib/sgf');

const router = express.Router();

router.get('/', async (req, res) => {
  const partidasCollection = getPartidasCollection();
  if (!partidasCollection) { res.json({ items: [], page: 1, limit: 10, total: 0, totalPages: 1 }); return; }
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = {};
    if (req.query.sala) filter.salaCode = String(req.query.sala).trim().toUpperCase();

    const total = await partidasCollection.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const docs = await partidasCollection
      .find(filter)
      .project({ moveHistory: 0 })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    res.json({
      items: docs.map(d => ({
        id: d._id.toString(),
        salaCode: d.salaCode,
        partidaNumber: d.partidaNumber,
        size: d.size,
        captureTarget: d.captureTarget,
        captures: d.captures,
        gameOver: d.gameOver,
        winner: d.winner,
        winReason: d.winReason,
        timeControlId: d.timeControlId || 'none',
        createdAt: d.createdAt,
        finishedAt: d.finishedAt,
      })),
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el historial.' });
  }
});

router.get('/id/:id', async (req, res) => {
  const partidasCollection = getPartidasCollection();
  if (!partidasCollection) { res.status(404).json({ error: 'El historial no está disponible en este servidor.' }); return; }
  try {
    const doc = await partidasCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) { res.status(404).json({ error: 'Partida no encontrada.' }); return; }
    res.json({
      id: doc._id.toString(),
      salaCode: doc.salaCode,
      partidaNumber: doc.partidaNumber,
      size: doc.size,
      captureTarget: doc.captureTarget,
      moveHistory: doc.moveHistory,
      captures: doc.captures,
      gameOver: doc.gameOver,
      winner: doc.winner,
      winReason: doc.winReason,
      timeControlId: doc.timeControlId || 'none',
      createdAt: doc.createdAt,
      finishedAt: doc.finishedAt,
    });
  } catch (err) {
    res.status(400).json({ error: 'Id de partida inválido.' });
  }
});

router.get('/id/:id/sgf', async (req, res) => {
  const partidasCollection = getPartidasCollection();
  if (!partidasCollection) { res.status(404).send('El historial no está disponible en este servidor.'); return; }
  try {
    const doc = await partidasCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) { res.status(404).send('Partida no encontrada.'); return; }
    const sgf = buildSgf(doc);
    res.setHeader('Content-Type', 'application/x-go-sgf');
    res.setHeader('Content-Disposition', `attachment; filename="atari-go-${doc.salaCode}-p${doc.partidaNumber}.sgf"`);
    res.send(sgf);
  } catch (err) {
    res.status(400).send('Id de partida inválido.');
  }
});

module.exports = router;
