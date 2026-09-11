const express = require('express');
const entities = require('../config/entities');

const router = express.Router();

function getEntity(req, res) {
  const entity = entities[req.params.entity];
  if (!entity) {
    res.status(404).json({ error: 'Entidad no encontrada' });
    return null;
  }
  return entity;
}

function refFieldNames(entity) {
  return entity.fields.filter((f) => f.type === 'ref').map((f) => f.name);
}

function pickBody(body, entity) {
  const out = {};
  for (const field of entity.fields) {
    if (field.readonly) continue;
    if (body[field.name] !== undefined) out[field.name] = body[field.name];
  }
  return out;
}

// Listado de entidades disponibles, para armar el menú del panel.
router.get('/', (req, res) => {
  const list = Object.entries(entities).map(([key, e]) => ({
    key,
    label: e.label,
    readonly: !!e.readonly,
  }));
  res.json(list);
});

router.get('/:entity/meta', (req, res) => {
  const entity = getEntity(req, res);
  if (!entity) return;
  res.json({ key: req.params.entity, label: entity.label, readonly: !!entity.readonly, fields: entity.fields });
});

router.get('/:entity', async (req, res) => {
  const entity = getEntity(req, res);
  if (!entity) return;
  let query = entity.model.find().sort({ createdAt: -1 }).limit(500);
  for (const field of refFieldNames(entity)) query = query.populate(field);
  const docs = await query;
  res.json(docs);
});

router.get('/:entity/:id', async (req, res) => {
  const entity = getEntity(req, res);
  if (!entity) return;
  let query = entity.model.findById(req.params.id);
  for (const field of refFieldNames(entity)) query = query.populate(field);
  const doc = await query;
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  res.json(doc);
});

router.post('/:entity', async (req, res) => {
  const entity = getEntity(req, res);
  if (!entity) return;
  if (entity.readonly) return res.status(403).json({ error: 'Entidad de solo lectura' });
  try {
    const doc = await entity.model.create(pickBody(req.body, entity));
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:entity/:id', async (req, res) => {
  const entity = getEntity(req, res);
  if (!entity) return;
  if (entity.readonly) return res.status(403).json({ error: 'Entidad de solo lectura' });
  try {
    const doc = await entity.model.findByIdAndUpdate(req.params.id, pickBody(req.body, entity), {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:entity/:id', async (req, res) => {
  const entity = getEntity(req, res);
  if (!entity) return;
  const doc = await entity.model.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
