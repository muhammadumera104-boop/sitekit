const env = require('./config/env');
const connectDb = require('./config/db');
const app = require('./app');
const { registerTemplates } = require('./services/templates');

(async () => {
  try {
    await connectDb();
    await registerTemplates();
    require('./services/purge').startPurgeJob();
    app.listen(env.port, () => console.log(`API listening on http://localhost:${env.port} (cloudinary: ${env.cloudinaryEnabled ? 'on' : 'off, using local uploads'})`));
  } catch (e) {
    console.error('Failed to start:', e.message);
    process.exit(1);
  }
})();
