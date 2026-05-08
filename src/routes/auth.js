'use strict';

const express = require('express');

const { generateRandomState } = require('../crypto');

function buildAuthRouter({ tiktokClient, accountStore, stateStore }) {
  const router = express.Router();

  router.get('/tiktok', (req, res) => {
    const state = generateRandomState(24);
    stateStore.set(state, { createdAt: Date.now() });
    setTimeout(() => stateStore.delete(state), 10 * 60 * 1000).unref();
    const url = tiktokClient.buildAuthorizeUrl(state);
    res.redirect(url);
  });

  router.get('/tiktok/callback', async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      return res
        .status(400)
        .send(renderCallbackPage({
          ok: false,
          message:
            'TikTok returned an error: ' +
            String(error) +
            (errorDescription ? ' — ' + errorDescription : ''),
        }));
    }
    if (!code || !state) {
      return res
        .status(400)
        .send(renderCallbackPage({
          ok: false,
          message: 'Missing code or state in TikTok callback.',
        }));
    }
    if (!stateStore.has(String(state))) {
      return res
        .status(400)
        .send(renderCallbackPage({
          ok: false,
          message: 'Invalid or expired OAuth state. Please try connecting again.',
        }));
    }
    stateStore.delete(String(state));

    try {
      const tokenInfo = await tiktokClient.exchangeCode(String(code));
      let profile = null;
      try {
        profile = await tiktokClient.getUserInfo(tokenInfo.access_token);
      } catch (profileErr) {
        console.warn(
          '[auth] user info request failed, continuing without profile:',
          profileErr.message
        );
      }
      const account = await accountStore.upsertFromTokenResponse(
        tokenInfo,
        profile
      );
      return res.send(renderCallbackPage({ ok: true, account }));
    } catch (err) {
      console.error('[auth] OAuth callback failed:', err);
      return res
        .status(500)
        .send(renderCallbackPage({
          ok: false,
          message: 'Failed to complete OAuth: ' + err.message,
        }));
    }
  });

  return router;
}

function renderCallbackPage({ ok, account, message }) {
  const title = ok ? 'TikTok account connected' : 'TikTok connection failed';
  const safeName =
    account && account.displayName
      ? String(account.displayName).replace(/[<>]/g, '')
      : '';
  const body = ok
    ? '<p>Connected ' +
      (safeName ? '<strong>' + safeName + '</strong>' : 'your TikTok account') +
      '.</p>' +
      '<p>You can close this tab and return to the dashboard.</p>'
    : '<p>' +
      String(message || 'Unknown error').replace(/[<>]/g, '') +
      '</p>';

  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' +
    title +
    '</title>' +
    '<style>body{background:#0b0b0f;color:#f1f1f4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}' +
    '.card{background:#16161c;border:1px solid #25252e;border-radius:14px;padding:32px 28px;max-width:480px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.4)}' +
    'h1{margin:0 0 12px;color:#FE2C55;font-size:20px}' +
    'p{margin:8px 0;line-height:1.5}' +
    'a{color:#FE2C55;text-decoration:none}' +
    '</style></head><body><div class="card"><h1>' +
    title +
    '</h1>' +
    body +
    '<p><a href="/">Back to dashboard</a></p>' +
    '<script>try{if(window.opener){window.opener.postMessage({type:"tiktok-oauth",ok:' +
    (ok ? 'true' : 'false') +
    '},"*");}}catch(e){}</script>' +
    '</div></body></html>'
  );
}

module.exports = { buildAuthRouter };
