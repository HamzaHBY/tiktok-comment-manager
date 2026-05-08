'use strict';

const crypto = require('crypto');

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

function sign(payload, secret, ttlSeconds) {
  if (!secret || typeof secret !== 'string') {
    throw new TypeError('jwt.sign requires a non-empty secret');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = Object.assign({}, payload, {
    iat: now,
    exp: now + (ttlSeconds || 60 * 60 * 24 * 7),
  });
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const data = headerB64 + '.' + payloadB64;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest();
  return data + '.' + base64UrlEncode(signature);
}

function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const data = headerB64 + '.' + payloadB64;
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret).update(data).digest();
  } catch (err) {
    return null;
  }
  let provided;
  try {
    provided = base64UrlDecode(signatureB64);
  } catch (err) {
    return null;
  }
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch (err) {
    return null;
  }
  if (
    !payload ||
    typeof payload.exp !== 'number' ||
    payload.exp * 1000 < Date.now()
  ) {
    return null;
  }
  return payload;
}

module.exports = { sign, verify };
