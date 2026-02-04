'use strict';

const nodemailer = require('nodemailer');

function parseBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function sanitize(str) {
  if (str == null) return '';
  return String(str).toString().slice(0, 5000);
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      const ct = (req.headers['content-type'] || '').toLowerCase();

      try {
        if (ct.includes('application/json')) {
          resolve(JSON.parse(data || '{}'));
          return;
        }
      } catch (_) {}

      if (ct.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(data);
        resolve(Object.fromEntries(params.entries()));
        return;
      }

      resolve({});
    });
  });
}

module.exports = async (req, res) => {
  // Ensure JSON responses
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const requiredEnv = [
    'MAIL_TO',
    'MAIL_FROM',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS'
  ];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({ error: 'Missing environment variables', missing })
    );
    return;
  }

  let payload = {};
  try {
    payload = await readBody(req);
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid request body' }));
    return;
  }

  const name = sanitize(payload.name);
  const email = sanitize(payload.email);
  const phone = sanitize(payload.phone);
  const message = sanitize(payload.message);

  if (!name || !email || !message) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Missing required fields: name, email, message' }));
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: parseBoolean(process.env.SMTP_SECURE || false),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const subj = `Uus päring tricoroll.ee — ${name}`;
  const plain = `Uus päring tricoroll.ee\n\n` +
    `Nimi: ${name}\n` +
    `E-mail: ${email}\n` +
    `Telefon: ${phone || '-'}\n\n` +
    `Sõnum:\n${message}`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1A2B3C;">
      <h2 style="margin:0 0 12px;">Uus päring tricoroll.ee</h2>
      <table style="border-collapse:collapse;min-width:300px;">
        <tr><td style="padding:6px 8px;font-weight:600;">Nimi</td><td style="padding:6px 8px;">${name}</td></tr>
        <tr><td style="padding:6px 8px;font-weight:600;">E-mail</td><td style="padding:6px 8px;">${email}</td></tr>
        <tr><td style="padding:6px 8px;font-weight:600;">Telefon</td><td style="padding:6px 8px;">${phone || '-'}</td></tr>
      </table>
      <div style="margin-top:14px;padding:10px;background:#F5F7FA;border-radius:8px;">
        <div style="font-weight:600;margin-bottom:6px;">Sõnum:</div>
        <div>${message.replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TO,
      replyTo: email || process.env.MAIL_FROM,
      subject: subj,
      text: plain,
      html,
    });

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('Email send error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to send email' }));
  }
};
