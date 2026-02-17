# Chat App Deployment Guide (Ubuntu + Docker)

This project is deployed with a single `docker compose` stack containing:
- PostgreSQL (`postgres`)
- Backend API (`backend`)
- Frontend static build (`frontend`)
- Nginx reverse proxy (`nginx`)
- Coturn TURN server (`turn`)

## 1) Prerequisites

- Ubuntu server with Docker + Docker Compose plugin installed
- Public server IP (you have: `45.149.76.159`)
- Open firewall/security group ports:
  - `80/tcp`
  - `3478/tcp`, `3478/udp`
  - `5349/tcp`, `5349/udp`
  - `49152-65535/udp`

## 2) Environment File

Create `.env` from template:

```bash
cp .env.example .env
```

Required values in `.env`:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `VITE_SERVER_URL`
- `TURN_EXTERNAL_IP`
- `TURN_REALM`, `TURN_SERVER_NAME`, `TURN_USER`, `TURN_PASSWORD`

## 3) Start Deployment

```bash
docker compose up -d --build
```

`db-init` runs `npm run db:push` and must complete successfully before `backend`, `frontend`, `nginx`, and `turn` can start.

## 4) Verify

```bash
docker compose ps
docker compose logs -f nginx backend postgres turn
```

Health check:
- `http://YOUR_SERVER_IP/health`

App URL:
- `http://YOUR_SERVER_IP`

## 5) Common Operations

Restart everything:

```bash
docker compose restart
```

Rebuild after code changes:

```bash
docker compose up -d --build
```

Stop stack:

```bash
docker compose down
```

Stop and remove volumes (destructive):

```bash
docker compose down -v
```

## 6) Troubleshooting

Backend cannot connect to DB:

```bash
docker compose logs -f postgres backend
```

Schema/tables not created:

```bash
docker compose logs -f db-init
docker compose run --rm db-init
```

Nginx is up but app is blank:
- Recheck `VITE_SERVER_URL` in `.env`
- Rebuild frontend image: `docker compose up -d --build frontend nginx`

Calls do not connect across networks:
- Recheck TURN values in `.env`
- Confirm UDP ports and relay range are open
- Inspect TURN logs: `docker compose logs -f turn`

## 7) Notes

- `turn` service uses `network_mode: host`, intended for Linux hosts like Ubuntu.
- Uploaded media is persisted in `uploads_data` volume.
- Database is persisted in `postgres_data` volume.
