# Deployment guide

## Quick start (any machine with Docker)
```bash
git clone https://github.com/dare66/PMO.git && cd PMO
./start.sh            # first run creates .env with random secrets, builds and starts db + api + web
```
Open http://localhost:8080. With `SEED_DEMO=true` (default in `.env.example`) a clearly-labelled synthetic organisation is loaded; the generated demo password is printed by `start.sh`. Demo accounts: `admin@`, `ceo@`, `pmo@`, `portfolio@`, `pm1@`, `pm2@`, `product@`, `product2@`, `ba@`, `bcm@`, `finance@`, `resources@`, `tester@`, `release@`, `ops@`, `security@`, `procurement@`, `cab@`, `auditor@`, `dev1..4@` – all `@demo.example`.

Windows: run the same `docker compose up -d --build` after copying `.env.example` to `.env` and replacing the `change-me` values.

## Production checklist
1. `SEED_DEMO=false`; set `ADMIN_EMAIL`/`ADMIN_PASSWORD` (≥12 chars, letters+digits) for the first administrator, then remove `ADMIN_PASSWORD` from the environment.
2. Terminate TLS in front of `web`; set `COOKIE_SECURE=true`.
3. Use managed PostgreSQL 16 with encryption at rest, PITR and daily backups; point `DATABASE_URL` at it (remove the `db` service).
4. Store secrets in your secret manager; rotate `JWT_SECRET` by deploying a new value (all sessions end).
5. Keep `AI_PROVIDER=local` unless DEC-07 is approved; external providers additionally need `AI_EXTERNAL_ALLOWED=true`.
6. One API replica runs jobs (`JOBS_ENABLED=true`); others `false` (ADR-0004).
7. Scan images and dependencies in CI; pin base images by digest for releases.

## Behind a corporate proxy
Builds accept an optional CA certificate as a BuildKit secret:
```bash
docker build --secret id=npm_ca,src=/path/to/corporate-ca.pem -t meridian-api ./backend
```

## Backup & restore (platform DR, target RTO 4h / RPO 24h)
```bash
docker compose exec db pg_dump -U meridian -Fc meridian > meridian-$(date +%F).dump
```
```bash
docker compose exec -T db pg_restore -U meridian -d meridian --clean --if-exists < meridian-YYYY-MM-DD.dump
```
After restore run `GET /api/audit/verify` (auditor) to confirm audit-chain integrity. Automating and drilling this is Phase 11.

## Migrations
Applied automatically on API start from `backend/migrations/*.sql` in a transaction each, recorded in `schema_migrations`. Never edit an applied migration – add a new file.
