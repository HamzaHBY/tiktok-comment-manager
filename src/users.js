'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const DEFAULT_USERS = { users: [] };

async function readJsonFile(file, defaultValue) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    if (!raw.trim()) return JSON.parse(JSON.stringify(defaultValue));
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return JSON.parse(JSON.stringify(defaultValue));
    }
    throw err;
  }
}

async function writeJsonFile(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, file);
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      SCRYPT_PARAMS,
      (err, derived) => {
        if (err) return reject(err);
        const stored =
          'scrypt$' +
          SCRYPT_PARAMS.N +
          '$' +
          SCRYPT_PARAMS.r +
          '$' +
          SCRYPT_PARAMS.p +
          '$' +
          salt.toString('hex') +
          '$' +
          derived.toString('hex');
        resolve(stored);
      }
    );
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) {
      return resolve(false);
    }
    const parts = stored.split('$');
    if (parts.length !== 6) return resolve(false);
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    if (!N || !r || !p || !salt.length || !expected.length) {
      return resolve(false);
    }
    crypto.scrypt(
      password,
      salt,
      expected.length,
      { N, r, p, maxmem: 256 * 1024 * 1024 },
      (err, derived) => {
        if (err) return resolve(false);
        if (
          derived.length !== expected.length ||
          !crypto.timingSafeEqual(derived, expected)
        ) {
          return resolve(false);
        }
        resolve(true);
      }
    );
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const e = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

class UserStore {
  constructor({ file }) {
    this.file = file;
    this._lock = Promise.resolve();
  }

  _withLock(fn) {
    const next = this._lock.then(fn, fn);
    this._lock = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async _readAll() {
    return readJsonFile(this.file, DEFAULT_USERS);
  }

  async _writeAll(data) {
    return writeJsonFile(this.file, data);
  }

  _toPublic(user) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      createdAt: user.createdAt,
    };
  }

  async list() {
    const data = await this._readAll();
    return data.users.map((u) => this._toPublic(u));
  }

  async findByEmail(email) {
    const e = normalizeEmail(email);
    const data = await this._readAll();
    return data.users.find((u) => u.email === e) || null;
  }

  async findById(id) {
    const data = await this._readAll();
    return data.users.find((u) => u.id === id) || null;
  }

  async create({ email, password, displayName }) {
    return this._withLock(async () => {
      const e = normalizeEmail(email);
      if (!isValidEmail(e)) {
        const err = new Error('Invalid email address');
        err.code = 'INVALID_EMAIL';
        throw err;
      }
      if (typeof password !== 'string' || password.length < 8) {
        const err = new Error('Password must be at least 8 characters');
        err.code = 'WEAK_PASSWORD';
        throw err;
      }
      if (password.length > 256) {
        const err = new Error('Password is too long (max 256 chars)');
        err.code = 'WEAK_PASSWORD';
        throw err;
      }
      const data = await this._readAll();
      if (data.users.some((u) => u.email === e)) {
        const err = new Error('An account with that email already exists');
        err.code = 'EMAIL_TAKEN';
        throw err;
      }
      const passwordHash = await hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        email: e,
        displayName: (displayName && String(displayName).trim()) || null,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      data.users.push(user);
      await this._writeAll(data);
      return this._toPublic(user);
    });
  }

  async verifyCredentials(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    return ok ? this._toPublic(user) : null;
  }
}

function ensureUsersFile(usersFile) {
  fs.mkdirSync(path.dirname(usersFile), { recursive: true });
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(
      usersFile,
      JSON.stringify(DEFAULT_USERS, null, 2),
      { mode: 0o600 }
    );
  }
}

module.exports = {
  UserStore,
  ensureUsersFile,
  hashPassword,
  verifyPassword,
  isValidEmail,
  normalizeEmail,
};
