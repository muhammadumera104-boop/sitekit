// Vercel serverless entry: the same Express app as `npm start`, with the MongoDB connection reused between calls.
const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const app = require('../src/app');
const { registerTemplates } = require('../src/services/templates');

let ready;
function init() {
  if (!ready) {
    ready = (async () => {
      if (mongoose.connection.readyState !== 1) await connectDb();
      await registerTemplates();
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

module.exports = async (req, res) => {
  try { await init(); } catch (e) {
    console.error('startup failed:', e.message);
    return res.status(503).json({ message: 'Service temporarily unavailable' });
  }
  return app(req, res);
};
