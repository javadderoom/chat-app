# TURN Docker Setup

This folder runs a standalone `coturn` server for WebRTC relay.

## 1) Edit config
Update `turnserver.conf`:
- `external-ip=YOUR_PUBLIC_IP`
- `realm=turn.your-domain.com`
- `server-name=turn.your-domain.com`
- `user=turnuser:turnpassword` (use strong credentials)
- Optional TLS cert paths for `turns:`

## 2) Open firewall ports
- `3478` TCP/UDP
- `5349` TCP/UDP
- UDP range `49152-65535`

## 3) Start TURN
From this folder:

```bash
docker compose up -d
```

## 4) Use in client `.env`
Set these in `client/.env`:

```env
VITE_TURN_URLS=turn:turn.your-domain.com:3478,turns:turn.your-domain.com:5349
VITE_TURN_USERNAME=turnuser
VITE_TURN_CREDENTIAL=turnpassword
```

Then restart your frontend.
