require('dotenv').config();
const env = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  mailFrom: process.env.MAIL_FROM || 'no-reply@platform.local',
  seedPassword: process.env.SEED_PASSWORD || 'Passw0rd!123',
  superAdmin: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD },
  staff: { email: process.env.STAFF_EMAIL, password: process.env.STAFF_PASSWORD },
};
env.isProd = env.nodeEnv === 'production';
env.cloudinaryEnabled = !!(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);
for (const k of ['mongoUri', 'accessSecret', 'refreshSecret']) {
  if (!env[k]) throw new Error(`Missing required env var for ${k}`);
}
module.exports = env;
