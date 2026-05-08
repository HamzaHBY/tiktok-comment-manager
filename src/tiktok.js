'use strict';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
const TIKTOK_COMMENT_PUBLISH_URL =
  'https://open.tiktokapis.com/v2/comment/publish/';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function buildAuthorizeUrl({ clientKey, redirectUri, scopes, state }) {
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
  });
  return TIKTOK_AUTH_URL + '?' + params.toString();
}

async function exchangeCodeForTokens({
  clientKey,
  clientSecret,
  code,
  redirectUri,
}) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const message =
      json.error_description ||
      json.error ||
      'TikTok token exchange failed (status ' + res.status + ')';
    const err = new Error(message);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function refreshAccessToken({ clientKey, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const message =
      json.error_description ||
      json.error ||
      'TikTok token refresh failed (status ' + res.status + ')';
    const err = new Error(message);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function revokeToken({ clientKey, clientSecret, accessToken }) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken,
  });
  const res = await fetch(TIKTOK_REVOKE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = new Error(
      json.error_description ||
        json.error ||
        'TikTok token revoke failed (status ' + res.status + ')'
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function getUserInfo({ accessToken }) {
  const fields = ['open_id', 'union_id', 'avatar_url', 'display_name'].join(
    ','
  );
  const url = TIKTOK_USER_INFO_URL + '?fields=' + encodeURIComponent(fields);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.error && json.error.code && json.error.code !== 'ok')) {
    const err = new Error(
      (json.error && json.error.message) ||
        'TikTok user info request failed (status ' + res.status + ')'
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return (json.data && json.data.user) || null;
}

function extractVideoIdFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const url = rawUrl.trim();
  const longMatch = url.match(/\/video\/(\d{6,25})/);
  if (longMatch) return longMatch[1];
  const numericOnly = url.match(/^(\d{6,25})$/);
  if (numericOnly) return numericOnly[1];
  const queryMatch = url.match(/[?&]item_id=(\d{6,25})/);
  if (queryMatch) return queryMatch[1];
  const lastSegment = url.match(/(\d{6,25})(?:[\/?#]|$)/);
  if (lastSegment) return lastSegment[1];
  return null;
}

async function publishComment({ accessToken, videoId, text }) {
  const res = await fetch(TIKTOK_COMMENT_PUBLISH_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ video_id: videoId, text }),
  });
  const json = await res.json().catch(() => ({}));
  if (
    !res.ok ||
    (json.error && json.error.code && json.error.code !== 'ok')
  ) {
    const err = new Error(
      (json.error && (json.error.message || json.error.code)) ||
        'TikTok comment publish failed (status ' + res.status + ')'
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json.data || json;
}

class TikTokClient {
  constructor({ clientKey, clientSecret, redirectUri, scopes, accountStore }) {
    this.clientKey = clientKey;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scopes = scopes;
    this.accountStore = accountStore;
  }

  buildAuthorizeUrl(state) {
    return buildAuthorizeUrl({
      clientKey: this.clientKey,
      redirectUri: this.redirectUri,
      scopes: this.scopes,
      state,
    });
  }

  async exchangeCode(code) {
    return exchangeCodeForTokens({
      clientKey: this.clientKey,
      clientSecret: this.clientSecret,
      code,
      redirectUri: this.redirectUri,
    });
  }

  async getUserInfo(accessToken) {
    return getUserInfo({ accessToken });
  }

  async getValidAccessToken(accountId) {
    const account = await this.accountStore.getByIdInternal(accountId);
    if (!account) throw new Error('Account not found: ' + accountId);

    const tokens = await this.accountStore.getDecryptedTokens(accountId);
    const now = Date.now();
    const expiresAt = account.tokenExpiresAt || 0;

    if (expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
      return tokens.accessToken;
    }

    const refreshed = await refreshAccessToken({
      clientKey: this.clientKey,
      clientSecret: this.clientSecret,
      refreshToken: tokens.refreshToken,
    });
    await this.accountStore.updateTokens(accountId, refreshed);
    return refreshed.access_token;
  }

  async revoke(accessToken) {
    return revokeToken({
      clientKey: this.clientKey,
      clientSecret: this.clientSecret,
      accessToken,
    });
  }

  async publishComment({ accountId, videoUrl, text }) {
    const videoId = extractVideoIdFromUrl(videoUrl);
    if (!videoId) {
      const err = new Error(
        'Could not extract a TikTok video id from URL: ' + videoUrl
      );
      err.code = 'INVALID_VIDEO_URL';
      throw err;
    }
    const accessToken = await this.getValidAccessToken(accountId);
    const result = await publishComment({ accessToken, videoId, text });
    return { videoId, result };
  }
}

module.exports = {
  TikTokClient,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  getUserInfo,
  publishComment,
  extractVideoIdFromUrl,
  TIKTOK_AUTH_URL,
  TIKTOK_TOKEN_URL,
  TIKTOK_REVOKE_URL,
  TIKTOK_USER_INFO_URL,
  TIKTOK_COMMENT_PUBLISH_URL,
};
