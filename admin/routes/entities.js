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
  return entity.fields.filter((f) => f.type === 'ref' || f.type === 'refs').map((f) => f.name);
}

// Sub-registro de un campo `items`: solo sus campos declarados, más el _id si ya existía
// (así se conserva la identidad del ítem al editar).
function pickItem(item, field) {
  const out = {};
  if (item && item._id) out._id = item._id;
  for (const sub of field.fields) {
    const value = item ? item[sub.name] : undefined;
    out[sub.name] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

function pickBody(body, entity) {
  const out = {};
  for (const field of entity.fields) {
    if (field.readonly) continue;
    let value = body[field.name];
    if (value === undefined) continue;
    if (field.type === 'password') {
      // Vacío = conservar la contraseña actual (al crear, el `required` del modelo lo rechaza).
      if (!value) continue;
      value = entity.model.hashPassword(value);
    } else if (field.type === 'list') {
      const items = Array.isArray(value) ? value : String(value).split(/\r?\n/);
      value = [...new Set(items.map((v) => String(v).trim()).filter(Boolean))];
    } else if (field.type === 'ref' && value === '') {
      value = null;
    } else if (field.type === 'refs') {
      value = Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
    } else if (field.type === 'items') {
      value = (Array.isArray(value) ? value : []).map((item) => pickItem(item, field));
    }
    out[field.name] = value;
  }
  return out;
}

// Los campos password nunca salen del backend.
function hidePasswords(doc, entity) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  for (const field of entity.fields) {
    if (field.type === 'password') delete obj[field.name];
  }
  return obj;
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
    res.status(201).json(hidePasswords(doc, entity));
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
    res.json(hidePasswords(doc, entity));
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
