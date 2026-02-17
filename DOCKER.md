# Docker Deployment (Ubuntu Server)

This project now includes a single Docker Compose stack for:
- PostgreSQL database
- Backend API
- Frontend build container
- Edge Nginx reverse proxy
- Coturn TURN server

## 1) Prepare environment file

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `VITE_SERVER_URL` (for example `http://YOUR_SERVER_IP_OR_DOMAIN`)
- `TURN_EXTERNAL_IP` (public server IP)
- `TURN_REALM`, `TURN_SERVER_NAME`, `TURN_USER`, `TURN_PASSWORD`

## 2) TLS certificates

Create a `certs` folder in project root and place:
- `certs/fullchain.pem`
- `certs/privkey.pem`

These files are mounted into both `nginx` and `turn`.

## 3) Open firewall ports

- `80/tcp` (HTTP redirect to HTTPS)
- `443/tcp` (HTTPS app)
- `3478/tcp` and `3478/udp` (TURN)
- `5349/tcp` and `5349/udp` (TURNS)
- TURN relay UDP range: `49152-65535/udp` (or your custom range from `.env`)

## 4) Start services

```bash
docker compose up -d --build
```

## 5) Verify

```bash
docker compose ps
docker compose logs -f nginx backend turn
```

Health endpoint:
- `https://YOUR_SERVER_IP_OR_DOMAIN/health`

## Notes

- TURN service uses `network_mode: host`, which is intended for Linux hosts (Ubuntu server).
- Uploaded files are persisted in the `uploads_data` named volume.
- Database data is persisted in the `postgres_data` named volume.
