require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { connectDB } = require('../config/db');
const entitiesRouter = require('./routes/entities');

async function bootstrap() {
  await connectDB();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/entities', entitiesRouter);
  app.get('/health', (req, res) => res.json({ ok: true }));

  const PORT = process.env.ADMIN_PORT || 4000;
  app.listen(PORT, () => {
    console.log(`[admin] Panel de administración en http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[admin] Error fatal en el arranque:', err);
  process.exit(1);
});
