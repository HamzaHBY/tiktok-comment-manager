'use strict';

const express = require('express');

const jwt = require('../jwt');

const SAFE_NAME_RE = /^[\p{L}\p{N}_'\- .]{0,80}$/u;

function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || !header) return out;
  const parts = header.split(';');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(value);
  }
  return out;
}

function buildAuthMiddleware({ userStore, config }) {
  return async function authMiddleware(req, res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies[config.sessionCookieName];
      if (!token) {
        req.user = null;
        return next();
      }
      const payload = jwt.verify(token, config.jwtSecret);
      if (!payload || !payload.sub) {
        req.user = null;
        return next();
      }
      const user = await userStore.findById(payload.sub);
      if (!user) {
        req.user = null;
        return next();
      }
      req.user = userStore._toPublic(user);
      next();
    } catch (err) {
      req.user = null;
      next();
    }
  };
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function setSessionCookie(res, token, config) {
  const maxAgeSeconds = config.sessionTtlDays * 24 * 60 * 60;
  const parts = [
    config.sessionCookieName + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSeconds,
  ];
  if (config.isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res, config) {
  const parts = [
    config.sessionCookieName + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (config.isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function issueSession(res, user, config) {
  const token = jwt.sign(
    { sub: user.id, email: user.email },
    config.jwtSecret,
    config.sessionTtlDays * 24 * 60 * 60
  );
  setSessionCookie(res, token, config);
}

function buildAuthAppRouter({ userStore, config }) {
  const router = express.Router();

  router.post('/signup', async (req, res, next) => {
    try {
      const { email, password, displayName } = req.body || {};
      if (
        displayName != null &&
        typeof displayName === 'string' &&
        displayName.trim() &&
        !SAFE_NAME_RE.test(displayName.trim())
      ) {
        return res
          .status(400)
          .json({ error: 'Display name contains invalid characters' });
      }
      const user = await userStore.create({ email, password, displayName });
      issueSession(res, user, config);
      res.status(201).json({ user });
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') {
        return res.status(409).json({ error: err.message });
      }
      if (err.code === 'INVALID_EMAIL' || err.code === 'WEAK_PASSWORD') {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        return res
          .status(400)
          .json({ error: 'email and password are required' });
      }
      const user = await userStore.verifyCredentials(email, password);
      if (!user) {
        return res
          .status(401)
          .json({ error: 'Invalid email or password' });
      }
      issueSession(res, user, config);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({ user: req.user });
  });

  return router;
}

module.exports = {
  buildAuthMiddleware,
  buildAuthAppRouter,
  requireAuth,
  parseCookies,
};
