'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encrypt(plainText, key) {
  if (typeof plainText !== 'string') {
    throw new TypeError('encrypt() expects a string');
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new TypeError('encrypt() expects a 32-byte Buffer key');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString('base64');
}

function decrypt(payload, key) {
  if (typeof payload !== 'string') {
    throw new TypeError('decrypt() expects a base64 string');
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new TypeError('decrypt() expects a 32-byte Buffer key');
  }

  const data = Buffer.from(payload, 'base64');
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted payload');
  }

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

function generateRandomState(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generatePkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

module.exports = {
  encrypt,
  decrypt,
  generateRandomState,
  generatePkce,
};
