'use strict';

const Dojo = require('../models/Dojo');

const DEFAULT_DOJO_NAME = 'Dojo Tierra';

/** Cache en memoria: Map<dojoIdString, {_id, name}> */
const dojoCache = new Map();

async function ensureDefaultDojo() {
  const count = await Dojo.countDocuments();
  if (count === 0) {
    await Dojo.create({ name: DEFAULT_DOJO_NAME });
    console.log(`[dojoManager] No había dojos registrados, se creó "${DEFAULT_DOJO_NAME}"`);
  }
}

async function loadDojosIntoCache() {
  const dojos = await Dojo.find().sort({ name: 1 }).lean();
  dojoCache.clear();
  for (const dojo of dojos) {
    dojoCache.set(String(dojo._id), dojo);
  }
  return listDojos();
}

function listDojos() {
  return Array.from(dojoCache.values());
}

function getDojo(dojoId) {
  return dojoCache.get(String(dojoId)) || null;
}

async function init() {
  await ensureDefaultDojo();
  await loadDojosIntoCache();
}

module.exports = {
  DEFAULT_DOJO_NAME,
  init,
  listDojos,
  getDojo,
  loadDojosIntoCache,
};
