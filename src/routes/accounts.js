'use strict';

const express = require('express');

function buildAccountsRouter({ accountStore, tiktokClient }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const accounts = await accountStore.list();
      res.json({ accounts });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      let revoked = false;
      try {
        const tokens = await accountStore.getDecryptedTokens(id);
        if (tokens && tokens.accessToken) {
          await tiktokClient.revoke(tokens.accessToken);
          revoked = true;
        }
      } catch (revokeErr) {
        console.warn(
          '[accounts] failed to revoke token (continuing):',
          revokeErr.message
        );
      }
      const removed = await accountStore.remove(id);
      if (!removed) {
        return res.status(404).json({ error: 'Account not found' });
      }
      res.json({ ok: true, revoked });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAccountsRouter };
