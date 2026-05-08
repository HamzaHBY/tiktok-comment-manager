'use strict';

const path = require('path');

const REQUIRED_ENV_VARS = [
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'APP_URL',
  'ENCRYPTION_KEY',
  'JWT_SECRET',
];

const OAUTH_SCOPES = [
  'user.info.basic',
  'video.list',
  'comment.list.manage',
  'comment.publish',
];

const DATA_DIR = path.join(__dirname, '..', 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const SESSION_COOKIE_NAME = 'tcm_session';

function getConfig() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      'Missing required environment variables: ' +
        missing.join(', ') +
        '. Copy .env.example to .env and fill in real values.'
    );
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  const sessionTtlDays = parseInt(process.env.SESSION_TTL_DAYS || '7', 10);
  if (!Number.isFinite(sessionTtlDays) || sessionTtlDays < 1) {
    throw new Error('SESSION_TTL_DAYS must be a positive integer.');
  }

  const appUrl = process.env.APP_URL.replace(/\/$/, '');

  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    appUrl,
    redirectUri: appUrl + '/auth/tiktok/callback',
    port: parseInt(process.env.PORT || '3000', 10),
    encryptionKey: Buffer.from(encryptionKey, 'hex'),
    jwtSecret,
    sessionTtlDays,
    sessionCookieName: SESSION_COOKIE_NAME,
    scopes: OAUTH_SCOPES,
    dataDir: DATA_DIR,
    accountsFile: ACCOUNTS_FILE,
    jobsFile: JOBS_FILE,
    usersFile: USERS_FILE,
    isProd: appUrl.startsWith('https://'),
  };
}

module.exports = {
  getConfig,
  OAUTH_SCOPES,
  DATA_DIR,
  ACCOUNTS_FILE,
  JOBS_FILE,
  USERS_FILE,
  SESSION_COOKIE_NAME,
};
