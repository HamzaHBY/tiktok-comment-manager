'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const { getConfig } = require('./src/config');
const { AccountStore, JobStore, ensureDataFiles } = require('./src/store');
const { UserStore, ensureUsersFile } = require('./src/users');
const { TikTokClient } = require('./src/tiktok');
const { CommentScheduler } = require('./src/scheduler');
const { buildAuthRouter } = require('./src/routes/auth');
const { buildAccountsRouter } = require('./src/routes/accounts');
const { buildCommentsRouter } = require('./src/routes/comments');
const { buildJobsRouter } = require('./src/routes/jobs');
const {
  buildAuthMiddleware,
  buildAuthAppRouter,
  requireAuth,
} = require('./src/routes/users');

const PUBLIC_PAGES = {
  '/': 'index.html',
  '/login': 'login.html',
  '/signup': 'signup.html',
  '/app': 'app.html',
};

function createApp() {
  const config = getConfig();
  ensureDataFiles(config);
  ensureUsersFile(config.usersFile);

  const accountStore = new AccountStore({
    file: config.accountsFile,
    encryptionKey: config.encryptionKey,
  });
  const jobStore = new JobStore({ file: config.jobsFile });
  const userStore = new UserStore({ file: config.usersFile });

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

  const attachUser = buildAuthMiddleware({ userStore, config });
  app.use(attachUser);

  Object.keys(PUBLIC_PAGES).forEach((route) => {
    const file = PUBLIC_PAGES[route];
    app.get(route, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', file));
    });
  });

  app.use(
    express.static(path.join(__dirname, 'public'), { index: false })
  );

  app.use('/api/auth', buildAuthAppRouter({ userStore, config }));

  app.use(
    '/auth',
    buildAuthRouter({ tiktokClient, accountStore, stateStore })
  );

  app.use(
    '/api/accounts',
    requireAuth,
    buildAccountsRouter({ accountStore, tiktokClient })
  );
  app.use(
    '/api/comment',
    requireAuth,
    buildCommentsRouter({ accountStore, jobStore, scheduler, tiktokClient })
  );
  app.use(
    '/api/jobs',
    requireAuth,
    buildJobsRouter({ jobStore, scheduler })
  );

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      appUrl: config.appUrl,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      authenticated: !!req.user,
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
