# Production Deploy (Vercel + VPS Docker)

## 1) Architecture
- Frontend: Vercel
- Backend/API + Socket.IO: VPS (Docker)
- Containers on VPS: `backend`, `mongo`, `redis`, `nginx`

## 2) Files in this folder
- `docker-compose.production.yml`
- `nginx/nginx.conf`
- `env/backend.env.example`
- `.env.example`

## 3) Prepare VPS
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

## 4) Configure env
```bash
cd deploy
cp .env.example .env
cp env/backend.env.example env/backend.env
```

Edit:
- `deploy/.env`
- `deploy/env/backend.env`

## 5) Start stack
```bash
cd deploy
docker compose -f docker-compose.production.yml --env-file .env up -d --build
docker compose -f docker-compose.production.yml ps
```

## 6) Vercel env vars (Frontend)
Set these in Vercel project settings:
- `BACKEND_URL=https://api.bot.tervux.com`
- `NEXT_PUBLIC_API_URL=https://api.bot.tervux.com/api`
- `NEXT_PUBLIC_SOCKET_URL=https://api.bot.tervux.com`

## 7) DNS
- `bot.tervux.com` -> Vercel
- `api.bot.tervux.com` -> VPS public IP

## 8) TLS (HTTPS)
Use Cloudflare proxy/SSL or certbot on VPS.
If certbot is used, update nginx config to listen on `443 ssl` with cert files.

## 9) Useful commands
```bash
# logs
docker compose -f docker-compose.production.yml logs -f backend

# restart only backend
docker compose -f docker-compose.production.yml restart backend

# update after git pull
docker compose -f docker-compose.production.yml --env-file .env up -d --build backend nginx
```

