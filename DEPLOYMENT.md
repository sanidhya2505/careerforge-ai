# CareerForge AI — Deployment Guide

Three deployment paths are included. Pick based on stage of the business.

## 0. One-time setup (all paths)
```bash
cp .env.example .env
# edit .env and paste your real ANTHROPIC_API_KEY
```

## Path A — Local / development
```bash
npm install
npm run dev        # auto-restarts on file changes
```
Visit `http://localhost:3000`.

## Path B — Cheapest launch: Render.com (no server management)
Best for validating the idea before spending on infra.

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, point it at the repo — it auto-detects `render.yaml`.
3. Add `ANTHROPIC_API_KEY` as a secret env var in the Render dashboard (the file deliberately does not commit real keys — `sync: false`).
4. Deploy. Render handles HTTPS, restarts, and scaling automatically.

Cost at low volume: effectively the Render starter tier, scales with traffic — matches the "pay-as-you-grow" cost model from the business plan.

## Path C — Full control: Docker + Nginx + free SSL (VPS: DigitalOcean/AWS Lightsail/Hetzner)
Use once you have paying users and want your own domain with HTTPS.

```bash
# 1. Point your domain's DNS A record at the VPS IP first.

# 2. Get free SSL certificates (first run only)
mkdir -p certbot/conf certbot/www
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d careerforge.ai -d www.careerforge.ai --email you@example.com --agree-tos

# 3. Edit nginx.conf: replace "careerforge.ai" with your real domain.

# 4. Build and run everything
docker compose up -d --build

# 5. Verify
curl https://careerforge.ai/api/health
```

What's running:
- **app** — the Node.js service (auto-restarts on crash via `restart: unless-stopped`)
- **nginx** — reverse proxy, terminates SSL, forwards to `app` on port 3000
- **certbot** — renews the free Let's Encrypt certificate every 12 hours automatically

## Scaling checklist as the business grows (maps to the financial model)
| Users | What to change |
|---|---|
| 0 – 1,000 | Path B (Render) is enough; single instance |
| 1,000 – 10,000 | Move to Path C on a $12-24/mo VPS; add a managed Postgres for user/subscription data |
| 10,000+ | Split `app` into multiple containers behind Nginx `upstream` load balancing; move rate limiting to Redis-backed store instead of in-memory |

## Environment variables reference
| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Auth for all AI calls — this is the variable cost line from the cost-breakdown chart |
| `PORT` | No (default 3000) | Port the Node process binds to |

## Monitoring in production
- `GET /api/health` — wire this into UptimeRobot / Render's built-in health checks / Docker's `HEALTHCHECK` (already configured in `Dockerfile` and `docker-compose.yml`).
- `morgan("combined")` in `server.js` writes access logs to stdout — capture with `docker compose logs -f app` or forward to a log service later.
