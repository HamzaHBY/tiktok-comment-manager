# Deploying on a VPS with Caddy

This guide covers deploying TikTok Comment Manager on a VPS behind a
Caddy reverse proxy with automatic HTTPS.

## 1. Install Node.js (18+)

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 2. Clone & install

```bash
git clone https://github.com/HamzaHBY/tiktok-comment-manager.git
cd tiktok-comment-manager
npm install
```

## 3. Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in:

| Variable | Description |
|---|---|
| `TIKTOK_CLIENT_KEY` | Client Key from your TikTok Developer App |
| `TIKTOK_CLIENT_SECRET` | Client Secret from your TikTok Developer App |
| `APP_URL` | Public URL, e.g. `https://tiktok.example.com` |
| `PORT` | Port to listen on (default `3000`) |
| `ENCRYPTION_KEY` | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

## 4. Systemd service

Copy the service file and create the env file:

```bash
sudo cp deploy/tiktok-comment-manager.service /etc/systemd/system/
sudo cp .env /etc/default/tiktok-comment-manager

# Adjust user/path in the service file if needed
sudo systemctl daemon-reload
sudo systemctl enable tiktok-comment-manager
sudo systemctl start tiktok-comment-manager
```

Check logs:

```bash
sudo journalctl -u tiktok-comment-manager -f
```

## 5. Caddy reverse proxy

Add to your Caddyfile:

```
tiktok.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy:

```bash
sudo caddy reload --config /etc/caddy/Caddyfile
```

## 6. TikTok Developer App

1. Go to <https://developers.tiktok.com/> → **Manage apps** → **Connect an app**
2. Add **Login Kit** and **Content Posting API** products
3. In Login Kit settings, add the redirect URI:
   ```
   https://tiktok.example.com/auth/tiktok/callback
   ```
4. Select scopes: `user.info.basic`, `video.list`, `comment.list.manage`, `comment.publish`
5. Copy **Client Key** and **Client Secret** into your `.env`

## Notes

- `.env` contains secrets — never commit it. It's in `.gitignore`.
- `data/` stores accounts and jobs as JSON. Back it up regularly.
- In Staging mode, only your own TikTok account can connect. Submit for
  Production review to allow other users.