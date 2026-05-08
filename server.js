'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const { getConfig } = require('./src/config');
const { AccountStore, JobStore, ensureDataFiles } = require('./src/store');
const { TikTokClient } = require('./src/tiktok');
const { CommentScheduler } = require('./src/scheduler');
const { buildAuthRouter } = require('./src/routes/auth');
const { buildAccountsRouter } = require('./src/routes/accounts');
const { buildCommentsRouter } = require('./src/routes/comments');
const { buildJobsRouter } = require('./src/routes/jobs');

function createApp() {
  const config = getConfig();
  ensureDataFiles(config);

  const accountStore = new AccountStore({
    file: config.accountsFile,
    encryptionKey: config.encryptionKey,
  });
  const jobStore = new JobStore({ file: config.jobsFile });

  const tiktokClient = new TikTokClient({
    clientKey: config.clientKey,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    accountStore,
  });

  const scheduler = new CommentScheduler({ jobStore, tiktokClient });

  const stateStore = new Map();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.use(express.static(path.join(__dirname, 'public')));

  app.use(
    '/auth',
    buildAuthRouter({ tiktokClient, accountStore, stateStore })
  );
  app.use(
    '/api/accounts',
    buildAccountsRouter({ accountStore, tiktokClient })
  );
  app.use(
    '/api/comment',
    buildCommentsRouter({ accountStore, jobStore, scheduler, tiktokClient })
  );
  app.use('/api/jobs', buildJobsRouter({ jobStore, scheduler }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      appUrl: config.appUrl,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
    });
  });

  app.use((err, req, res, next) => {
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return { app, config, scheduler };
}

function main() {
  const { app, config, scheduler } = createApp();
  scheduler.start();
  const server = app.listen(config.port, () => {
    console.log(
      'tiktok-comment-manager listening on ' +
        config.appUrl +
        ' (port ' +
        config.port +
        ')'
    );
    console.log('OAuth redirect URI: ' + config.redirectUri);
    console.log('Scopes: ' + config.scopes.join(', '));
  });
  const shutdown = (signal) => {
    console.log('Received ' + signal + ', shutting down...');
    scheduler.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main();
}

module.exports = { createApp };
