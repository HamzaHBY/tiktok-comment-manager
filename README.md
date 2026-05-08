# tiktok-comment-manager

A personal-productivity dashboard that lets you manage your **own** TikTok
accounts and post (or schedule) comments on TikTok videos from a single
place — no more switching browser tabs.

It uses TikTok's official **[TikTok for Developers](https://developers.tiktok.com/)**
APIs end-to-end:

- OAuth 2.0 **Login Kit** for connecting each account through the official
  TikTok consent screen.
- The **v2 Comment API** (`POST /v2/comment/publish/`) to publish comments.
- The **v2 OAuth token endpoint** to refresh access tokens automatically
  before they expire.

All tokens are encrypted with **AES-256-GCM** and stored locally in
`data/accounts.json`. There is no database — everything lives in JSON
files on your machine.

> ⚠️ This project is intended for managing **TikTok accounts you own**.
> Posting comments through any TikTok API requires that the authenticated
> user (i.e. _you_) has granted the `comment.publish` scope. You cannot
> use this tool to comment as someone else.

---

## Features

- **OAuth 2.0 Login Kit** — Connect any number of your own TikTok
  accounts through TikTok's official consent flow.
- **Encrypted token vault** — Access and refresh tokens are AES-256-GCM
  encrypted at rest using a key from `ENCRYPTION_KEY`.
- **Auto refresh** — Access tokens are refreshed automatically (with a
  5-minute safety buffer) before each TikTok API call.
- **Post comments** — Publishes via `POST /v2/comment/publish/`.
- **Scheduler** — Pick any future date/time and the comment is posted
  automatically by a `node-cron` worker.
- **Queue & History** — See pending/scheduled comments, cancel them, and
  review the success/failure log.
- **Single-page dashboard** — Dark theme with TikTok's signature
  `#FE2C55` accent. Pure HTML/CSS/JS, no build step.

---

## Tech stack

- Node.js 18+ (uses the built-in global `fetch`)
- Express 4
- node-cron
- dotenv
- AES-256-GCM via Node's built-in `crypto` module
- Vanilla HTML/CSS/JS frontend (no bundler)

---

## Project layout

```
tiktok-comment-manager/
├── server.js                  # Express bootstrap
├── package.json
├── .env.example
├── public/
│   └── index.html             # Dashboard (4 tabs)
├── src/
│   ├── config.js              # Loads/validates env config
│   ├── crypto.js              # AES-256-GCM helpers + state/PKCE
│   ├── store.js               # AccountStore + JobStore (JSON files)
│   ├── tiktok.js              # TikTok OAuth + Comment API client
│   ├── scheduler.js           # node-cron worker
│   └── routes/
│       ├── auth.js            # /auth/tiktok and /auth/tiktok/callback
│       ├── accounts.js        # /api/accounts
│       ├── comments.js        # /api/comment
│       └── jobs.js            # /api/jobs
└── data/                      # Created on first run, git-ignored
    ├── accounts.json
    └── jobs.json
```

---

## 1. Create a TikTok Developer App

1. Go to <https://developers.tiktok.com/> and sign in with the TikTok
   account you want to use as the app owner.
2. Open the **Manage apps** page (top-right account menu) and click
   **Connect an app**. Fill in the basic information about your app.
3. Once the app is created, open it and look for **Login Kit** under
   **Add products / Manage products**. Add it.
4. Also add **Content Posting API** (the family of products that
   contains the Comment APIs) so you can request the
   `comment.publish` and `comment.list.manage` scopes.
5. In the app's **Login Kit** configuration, add the following
   redirect URI exactly:
   ```
   http://localhost:3000/auth/tiktok/callback
   ```
   If you deploy the app to a public URL, also add
   `https://YOUR_DOMAIN/auth/tiktok/callback`.
6. Under **Scopes**, request and enable all four of the following:

   | Scope                  | Why this app needs it                                    |
   | ---------------------- | -------------------------------------------------------- |
   | `user.info.basic`      | Display the connected user's name + avatar in the UI.    |
   | `video.list`           | (Reserved) Allows listing your own videos for selection. |
   | `comment.list.manage`  | Required to read/manage comments on your own videos.     |
   | `comment.publish`      | Required to call `POST /v2/comment/publish/`.            |

7. From the app's **Basic information** page, copy the **Client key**
   and **Client secret** — you will paste them into `.env` in the next
   step.
8. Submit the app for **review/audit** if your account requires it.
   Comment-publishing scopes typically require TikTok approval before
   they will work for end users other than the app's developer/test
   accounts.

> Tip: while the app is still in **sandbox/dev mode**, only the
> **Target users** you explicitly add in the developer portal will be
> able to log in and have the new scopes applied. Add each TikTok
> account you intend to manage as a target user.

---

## 2. Configure environment

Clone the repo and create a `.env` file from the template:

```bash
cp .env.example .env
```

Generate a strong 32-byte encryption key for the local token vault:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open `.env` and fill in the values:

```dotenv
TIKTOK_CLIENT_KEY=awxxxxxxxxxxxxxxxx
TIKTOK_CLIENT_SECRET=your_client_secret_from_the_developer_portal
APP_URL=http://localhost:3000
PORT=3000
ENCRYPTION_KEY=<paste the 64-char hex string from the command above>
```

> **Important:** `APP_URL` must match the host part of the redirect
> URI you registered in the TikTok developer portal. The full redirect
> URI used by the app is always `${APP_URL}/auth/tiktok/callback`.

---

## 3. Install and run

```bash
npm install
npm start
```

Then open <http://localhost:3000> in your browser.

The dashboard has four tabs:

1. **Accounts** — click **Connect TikTok Account** to start the OAuth
   flow. TikTok opens a popup, you log in and approve the requested
   scopes, and the account appears in the list once the callback is
   complete. You can disconnect any account from here (this also
   revokes the token with TikTok).
2. **Post Comment** — pick a connected account, paste a video URL,
   write your comment, and either submit immediately or pick a future
   date/time to schedule it.
3. **Queue** — pending and scheduled comments. You can cancel anything
   that has not run yet.
4. **History** — log of every comment that was successfully posted,
   failed, or was cancelled, with the TikTok response/error attached.

For development with auto-restart on file changes:

```bash
npm run dev
```

(Uses Node's built-in `--watch` flag, no extra dependency.)

---

## API reference

The same backend powers the dashboard and is also a clean REST surface
you can hit from your own scripts.

### `GET /api/accounts`

List connected accounts (no tokens are exposed).

```json
{
  "accounts": [
    {
      "id": "uuid",
      "openId": "...",
      "unionId": "...",
      "displayName": "user",
      "avatarUrl": "https://...",
      "scopes": ["user.info.basic", "comment.publish", "comment.list.manage", "video.list"],
      "connectedAt": "2026-05-08T14:00:00.000Z",
      "tokenExpiresAt": 1746729600000,
      "refreshExpiresAt": 1762281600000
    }
  ]
}
```

### `DELETE /api/accounts/:id`

Disconnect an account. Attempts to revoke the access token with TikTok
and removes the encrypted entry from `data/accounts.json`.

### `GET /auth/tiktok`

Starts the OAuth flow by redirecting the browser to TikTok's official
consent screen. The app generates a one-time CSRF `state` value that is
verified in the callback.

### `GET /auth/tiktok/callback`

Handles the redirect back from TikTok. Exchanges the `code` for an
access + refresh token, fetches the user's basic profile, encrypts both
tokens with AES-256-GCM, and stores them in `data/accounts.json`.

### `POST /api/comment`

Post or schedule a comment.

```json
{
  "accountId": "uuid-from-/api/accounts",
  "videoUrl": "https://www.tiktok.com/@user/video/1234567890123456789",
  "comment": "great video!",
  "scheduleAt": "2026-06-01T10:30:00.000Z"
}
```

`scheduleAt` is optional. If omitted (or in the past), the comment is
posted immediately and the response includes the final job status. If
`scheduleAt` is in the future, the job is added to the queue and the
`node-cron` worker will run it within a minute of the target time.

### `GET /api/jobs`

List every queued, running, succeeded, failed, or cancelled job
(newest first).

### `POST /api/jobs/:id/cancel`

Cancel a job that has not run yet.

### `DELETE /api/jobs/clear`

Clear history (only success / failed / cancelled jobs are removed —
pending and scheduled jobs are preserved).

### `GET /api/health`

Returns the configured `appUrl`, `redirectUri`, and `scopes`. Useful
for verifying that your `.env` matches what you configured in the
TikTok developer portal.

---

## How token storage works

When TikTok returns an access token, the app:

1. Computes `tokenExpiresAt = now + expires_in * 1000` (in ms).
2. Encrypts both `access_token` and `refresh_token` with
   AES-256-GCM. The 32-byte key comes from `ENCRYPTION_KEY` (hex
   decoded). Each token has its own random 12-byte IV and 16-byte
   authentication tag, all packed into a single base64 string.
3. Writes the entry to `data/accounts.json` atomically via a `.tmp`
   file + `rename`.

Before any TikTok API call (`/v2/comment/publish/`,
`/v2/user/info/`, etc.), the client checks
`tokenExpiresAt - now > 5 minutes`. If not, it calls
`POST /v2/oauth/token/` with `grant_type=refresh_token`, persists the
new tokens, and uses the fresh access token for the call.

---

## Running in production

This tool is meant to be run locally on your own machine. If you do
deploy it somewhere:

- Generate a fresh `ENCRYPTION_KEY` per deployment (it must be a
  64-character hex string).
- Put the app behind HTTPS — the OAuth redirect URI must use HTTPS in
  production.
- Set `APP_URL=https://your-public-host` and add
  `https://your-public-host/auth/tiktok/callback` to the redirect URIs
  in the TikTok developer portal.
- Make sure `data/` is on persistent storage that is **not** publicly
  served. The `.gitignore` shipped with this repo already excludes
  `data/accounts.json` and `data/jobs.json` from version control.

---

## Troubleshooting

- **`Missing required environment variables`** on startup — copy
  `.env.example` to `.env` and fill in real values.
- **`ENCRYPTION_KEY must be a 64-character hex string`** — regenerate
  it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- **OAuth redirect mismatch** — the redirect URI registered in the
  TikTok developer portal must exactly match `${APP_URL}/auth/tiktok/callback`,
  including scheme, host, port, and path.
- **`comment.publish` errors with `scope_not_authorized`** — your
  TikTok app has not been approved for that scope yet. Add the
  account as a sandbox/test user, or submit the app for review.
- **Could not extract a TikTok video id from URL** — paste the full
  URL of a TikTok video (the one that contains `/video/<numeric_id>`).

---

## License

MIT
