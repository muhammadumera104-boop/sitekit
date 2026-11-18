const nodemailer = require('nodemailer');
const env = require('../config/env');

const transport = env.smtp.host
  ? nodemailer.createTransport({
    host: env.smtp.host, port: env.smtp.port,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  })
  : null;

// Falls back to printing the email in the console when SMTP is not configured.
exports.sendMail = async ({ to, subject, html, text }) => {
  if (!to) return;
  if (!transport) {
    console.log(`\n[EMAIL not configured -> console]\nTo: ${to}\nSubject: ${subject}\n${text || html}\n`);
    return;
  }
  try { await transport.sendMail({ from: env.mailFrom, to, subject, html, text }); }
  catch (e) { console.error('Email failed:', e.message); }
};
