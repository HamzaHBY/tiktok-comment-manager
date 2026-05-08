'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { encrypt, decrypt } = require('./crypto');

const DEFAULT_ACCOUNTS = { accounts: [] };
const DEFAULT_JOBS = { jobs: [] };

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

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
  await ensureDir(path.dirname(file));
  const tmp = file + '.tmp-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, file);
}

class AccountStore {
  constructor({ file, encryptionKey }) {
    this.file = file;
    this.encryptionKey = encryptionKey;
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
    return readJsonFile(this.file, DEFAULT_ACCOUNTS);
  }

  async _writeAll(data) {
    await writeJsonFile(this.file, data);
  }

  _toPublic(account) {
    return {
      id: account.id,
      openId: account.openId,
      unionId: account.unionId || null,
      displayName: account.displayName || null,
      avatarUrl: account.avatarUrl || null,
      scopes: account.scopes || [],
      connectedAt: account.connectedAt,
      tokenExpiresAt: account.tokenExpiresAt || null,
      refreshExpiresAt: account.refreshExpiresAt || null,
    };
  }

  async list() {
    const data = await this._readAll();
    return data.accounts.map((a) => this._toPublic(a));
  }

  async listInternal() {
    const data = await this._readAll();
    return data.accounts.slice();
  }

  async getById(id) {
    const data = await this._readAll();
    const account = data.accounts.find((a) => a.id === id);
    if (!account) return null;
    return account;
  }

  async getDecryptedTokens(id) {
    const account = await this.getById(id);
    if (!account) return null;
    return {
      accessToken: decrypt(account.encryptedAccessToken, this.encryptionKey),
      refreshToken: decrypt(account.encryptedRefreshToken, this.encryptionKey),
      tokenExpiresAt: account.tokenExpiresAt,
      refreshExpiresAt: account.refreshExpiresAt,
    };
  }

  async upsertFromTokenResponse(tokenInfo, profile) {
    return this._withLock(async () => {
      const data = await this._readAll();
      const now = Date.now();
      const tokenExpiresAt = now + tokenInfo.expires_in * 1000;
      const refreshExpiresAt =
        now + (tokenInfo.refresh_expires_in || 0) * 1000;

      const encryptedAccessToken = encrypt(
        tokenInfo.access_token,
        this.encryptionKey
      );
      const encryptedRefreshToken = encrypt(
        tokenInfo.refresh_token,
        this.encryptionKey
      );

      const openId = tokenInfo.open_id || (profile && profile.open_id);
      if (!openId) {
        throw new Error(
          'TikTok token response is missing open_id, cannot identify account.'
        );
      }

      let account = data.accounts.find((a) => a.openId === openId);
      const scopes =
        typeof tokenInfo.scope === 'string'
          ? tokenInfo.scope.split(/[,\s]+/).filter(Boolean)
          : [];

      if (account) {
        account.encryptedAccessToken = encryptedAccessToken;
        account.encryptedRefreshToken = encryptedRefreshToken;
        account.tokenExpiresAt = tokenExpiresAt;
        account.refreshExpiresAt = refreshExpiresAt;
        if (tokenInfo.union_id) account.unionId = tokenInfo.union_id;
        if (scopes.length) account.scopes = scopes;
        if (profile) {
          if (profile.display_name) account.displayName = profile.display_name;
          if (profile.avatar_url) account.avatarUrl = profile.avatar_url;
          if (profile.union_id) account.unionId = profile.union_id;
        }
      } else {
        account = {
          id: crypto.randomUUID(),
          openId,
          unionId: tokenInfo.union_id || (profile && profile.union_id) || null,
          displayName: (profile && profile.display_name) || null,
          avatarUrl: (profile && profile.avatar_url) || null,
          scopes,
          connectedAt: new Date(now).toISOString(),
          tokenExpiresAt,
          refreshExpiresAt,
          encryptedAccessToken,
          encryptedRefreshToken,
        };
        data.accounts.push(account);
      }

      await this._writeAll(data);
      return this._toPublic(account);
    });
  }

  async updateTokens(id, tokenInfo) {
    return this._withLock(async () => {
      const data = await this._readAll();
      const account = data.accounts.find((a) => a.id === id);
      if (!account) throw new Error('Account not found: ' + id);

      const now = Date.now();
      account.encryptedAccessToken = encrypt(
        tokenInfo.access_token,
        this.encryptionKey
      );
      if (tokenInfo.refresh_token) {
        account.encryptedRefreshToken = encrypt(
          tokenInfo.refresh_token,
          this.encryptionKey
        );
      }
      account.tokenExpiresAt = now + tokenInfo.expires_in * 1000;
      if (tokenInfo.refresh_expires_in) {
        account.refreshExpiresAt =
          now + tokenInfo.refresh_expires_in * 1000;
      }
      if (typeof tokenInfo.scope === 'string') {
        account.scopes = tokenInfo.scope.split(/[,\s]+/).filter(Boolean);
      }
      await this._writeAll(data);
      return this._toPublic(account);
    });
  }

  async remove(id) {
    return this._withLock(async () => {
      const data = await this._readAll();
      const before = data.accounts.length;
      data.accounts = data.accounts.filter((a) => a.id !== id);
      const removed = before !== data.accounts.length;
      if (removed) await this._writeAll(data);
      return removed;
    });
  }
}

class JobStore {
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
    return readJsonFile(this.file, DEFAULT_JOBS);
  }

  async _writeAll(data) {
    await writeJsonFile(this.file, data);
  }

  async list() {
    const data = await this._readAll();
    return data.jobs.slice().sort((a, b) => {
      const ta = a.runAt || a.createdAt;
      const tb = b.runAt || b.createdAt;
      return tb.localeCompare(ta);
    });
  }

  async create(job) {
    return this._withLock(async () => {
      const data = await this._readAll();
      const now = new Date().toISOString();
      const newJob = Object.assign(
        {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          status: 'pending',
        },
        job
      );
      data.jobs.push(newJob);
      await this._writeAll(data);
      return newJob;
    });
  }

  async update(id, patch) {
    return this._withLock(async () => {
      const data = await this._readAll();
      const job = data.jobs.find((j) => j.id === id);
      if (!job) return null;
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      await this._writeAll(data);
      return job;
    });
  }

  async getById(id) {
    const data = await this._readAll();
    return data.jobs.find((j) => j.id === id) || null;
  }

  async clear() {
    return this._withLock(async () => {
      const data = await this._readAll();
      const cleared = data.jobs.filter(
        (j) => j.status !== 'pending' && j.status !== 'scheduled'
      ).length;
      data.jobs = data.jobs.filter(
        (j) => j.status === 'pending' || j.status === 'scheduled'
      );
      await this._writeAll(data);
      return cleared;
    });
  }
}

function ensureDataFiles(config) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(config.accountsFile)) {
    fs.writeFileSync(
      config.accountsFile,
      JSON.stringify(DEFAULT_ACCOUNTS, null, 2),
      { mode: 0o600 }
    );
  }
  if (!fs.existsSync(config.jobsFile)) {
    fs.writeFileSync(
      config.jobsFile,
      JSON.stringify(DEFAULT_JOBS, null, 2),
      { mode: 0o600 }
    );
  }
}

module.exports = {
  AccountStore,
  JobStore,
  ensureDataFiles,
};
