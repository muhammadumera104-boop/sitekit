const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { mongoSanitize } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/error');
const { uploadDir } = require('./services/storage');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: [env.clientUrl], credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(mongoSanitize);
if (!env.isProd) app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tenant', require('./routes/tenant'));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
