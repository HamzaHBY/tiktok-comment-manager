'use strict';

const path = require('path');

const REQUIRED_ENV_VARS = [
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'APP_URL',
  'ENCRYPTION_KEY',
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

  const appUrl = process.env.APP_URL.replace(/\/$/, '');

  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    appUrl,
    redirectUri: appUrl + '/auth/tiktok/callback',
    port: parseInt(process.env.PORT || '3000', 10),
    encryptionKey: Buffer.from(encryptionKey, 'hex'),
    scopes: OAUTH_SCOPES,
    dataDir: DATA_DIR,
    accountsFile: ACCOUNTS_FILE,
    jobsFile: JOBS_FILE,
  };
}

module.exports = {
  getConfig,
  OAUTH_SCOPES,
  DATA_DIR,
  ACCOUNTS_FILE,
  JOBS_FILE,
};
