// Scheduled jobs for serverless hosting (Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>").
const router = require('express').Router();
const { HttpError, wrap } = require('../utils/helpers');
const { purgeExpiredTenants } = require('../services/purge');

router.get('/purge', wrap(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed');
  res.json({ purged: await purgeExpiredTenants() });
}));

module.exports = router;
