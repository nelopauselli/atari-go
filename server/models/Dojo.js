'use strict';

const { Schema, model } = require('mongoose');

const DojoSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

module.exports = model('Dojo', DojoSchema);
