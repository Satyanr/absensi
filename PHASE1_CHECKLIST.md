# Phase 1 verification checklist

Run on the target machine after `cp .env.example .env` and changing secrets.

- [ ] `docker compose config` succeeds.
- [ ] `docker compose up -d --build` succeeds.
- [ ] `docker compose ps` shows postgres/app/tunnel/backup running.
- [ ] `docker compose exec app npx prisma migrate status` shows database up to date.
- [ ] `docker compose exec app npx prisma db seed` succeeds.
- [ ] `GET /api/health` returns `{ ok: true, database: "up" }`.
- [ ] Admin can login, refresh page, and remains logged in.
- [ ] Wrong credentials return 401 without creating a session.
- [ ] Logout deletes the server-side session.
- [ ] `docker compose logs tunnel` exposes a valid `https://*.trycloudflare.com` URL.
- [ ] Open public URL from iPhone Safari and confirm it is HTTPS/no certificate warning.
- [ ] Reboot host and confirm Docker services auto-start.
- [ ] Confirm the Quick Tunnel URL trade-off: it may differ after tunnel recreation/restart.
- [ ] Confirm a DB dump and photo tar appear under `storage/backup` after backup execution.
- [ ] Perform one restore rehearsal before production rollout.
