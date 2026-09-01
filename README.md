# Absensi Internal — Phase 1

Fondasi baru untuk menggantikan aplikasi Laravel/MySQL lama. Stack: **Next.js 16 + React + TypeScript + Tailwind CSS + PostgreSQL + Prisma + Zod + Docker Compose**.

## Scope Phase 1

Sudah disiapkan:

- Next.js App Router, same-origin frontend/backend.
- PostgreSQL + Prisma schema ter-normalisasi.
- Employee master dengan relasi berbasis ID, bukan nama.
- Session-based authentication dengan opaque random token, hash token di DB, dan cookie HTTP-only.
- Login skeleton mendukung `employee_code`, username, atau email; user employee dapat memakai PIN hash, admin memakai password hash.
- Attendance policy sebagai data DB (default: terlambat setelah 08:15, pulang normal 17:00, lembur setelah 19:00, timezone Asia/Jakarta).
- Attendance location/geofence schema.
- `attendance_days` unik per employee + tanggal dan `attendance_events` sebagai raw immutable-ish event layer.
- GPS fields, server/client timestamps, source, geofence flag/distance, device info, dan attachment metadata.
- Leave requests/balances, audit logs, legacy identifier fields.
- Persistent volume PostgreSQL dan foto attendance.
- Backup harian DB + volume foto, retention sederhana 14 hari.
- Cloudflare Quick Tunnel untuk HTTPS gratis tanpa port forwarding.

Belum diimplementasikan pada Phase 1: capture kamera, fallback file camera, geolocation acquisition, check-in/out transaction/service, admin CRUD, legacy importer, XLSX/PDF reports, dan UI final.

## Kenapa Cloudflare Quick Tunnel

Requirement project adalah biaya domain + SSL **Rp0**, HTTPS valid, tanpa port forwarding, dan tidak mewajibkan custom domain. Quick Tunnel menjalankan `cloudflared tunnel --url http://app:3000` dan memberikan URL HTTPS `https://<random>.trycloudflare.com` tanpa akun/domain/token.

Trade-off penting: URL Quick Tunnel **tidak permanen** dan dapat berubah ketika tunnel dibuat ulang/restart. Cloudflare memosisikan Quick Tunnel untuk testing/development. Named Cloudflare Tunnel dapat dibuat persisten sebagai service, tetapi hostname publik stabil lazimnya membutuhkan domain/zone yang dikelola Cloudflare. Karena project melarang pembelian domain, Phase 1 memilih opsi gratis tanpa menyamarkan trade-off ini.

Untuk kantor yang hanya perlu akses dari device yang menjadi anggota private network, Tailscale bisa menjadi opsi Phase lanjutan. Namun untuk link HTTPS yang cukup dibuka Safari karyawan tanpa onboarding VPN per-device, Quick Tunnel lebih sederhana.

## Menjalankan via Docker

1. Copy environment:

```bash
cp .env.example .env
```

2. Ganti minimal `POSTGRES_PASSWORD`, `SEED_ADMIN_EMAIL`, dan `SEED_ADMIN_PASSWORD` di `.env`.

3. Build dan start:

```bash
docker compose up -d --build
```

4. Jalankan seed pertama kali:

```bash
docker compose exec app npx prisma db seed
```

5. Local app:

```text
http://localhost:3000
```

6. Lihat URL HTTPS gratis yang dibuat Cloudflare:

```bash
docker compose logs tunnel
```

Cari baris URL `https://....trycloudflare.com`.

7. Health check:

```text
http://localhost:3000/api/health
```

Semua service menggunakan `restart: unless-stopped`, sehingga Docker dapat menghidupkan stack kembali sesudah reboot apabila Docker Desktop/Engine dikonfigurasi start otomatis. Quick Tunnel akan hidup kembali juga, tetapi URL publik dapat berubah.

## Local development tanpa Docker untuk app

Jalankan PostgreSQL dari compose:

```bash
docker compose up -d postgres
```

Set `DATABASE_URL` agar menunjuk ke `localhost:5432`, lalu:

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## Authentication skeleton

- Session token adalah random 256-bit opaque token.
- Browser menerima token lewat cookie HTTP-only, SameSite=Lax.
- Database hanya menyimpan SHA-256 token, bukan raw token.
- Session mempunyai expiry dan dapat dihapus server-side.
- PIN/password menggunakan bcrypt.
- Employee tidak memilih nama dari datalist; identity berasal dari account yang terhubung ke employee.

Sebelum production, Phase 2/3 perlu menambahkan rate limiting / failed-login protection dan audit event login/logout yang lebih lengkap.

## Storage foto

Foto tidak disimpan sebagai binary di PostgreSQL. Volume `attendance_photos` dipasang ke `/app/storage/attendance`; tabel `attachments` menyimpan metadata/path/checksum. Endpoint upload dan image processing baru dibuat bersama modul attendance Phase 2.

## Backup dan restore

Container `backup` membuat:

- `/storage/backup/db-YYYYMMDD-HHMMSS.dump`
- `/storage/backup/photos-YYYYMMDD-HHMMSS.tar.gz`

Restore database (contoh):

```bash
docker compose stop app
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
cat storage/backup/db-YYYYMMDD-HHMMSS.dump | docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists
```

Restore foto harus dilakukan ke volume `attendance_photos` dari tar backup. Prosedur restore penuh wajib diuji pada staging/copy server sebelum dianggap production-ready.

## Prinsip migration legacy

Jangan import tabel Laravel langsung ke tabel domain baru. Phase migration mengikuti:

```text
MySQL lama -> staging legacy_* -> normalization -> PostgreSQL domain baru
```

`legacy_id`, `legacy_absensi_id`, `legacy_approval_id`, dan `legacy_filename` sudah tersedia untuk traceability. Status historis lama tidak akan dihitung ulang dengan policy baru.

## Phase 2 berikutnya

Urutan berikutnya yang disarankan:

1. Attendance service transaction: server time sebagai sumber resmi + idempotency/double-submit protection.
2. Employee attendance screen mobile-first.
3. Native `getUserMedia()` dengan `autoplay muted playsInline` dan fallback `<input type=file accept=image/* capture=user>`.
4. Native Geolocation API + timeout/accuracy UX + DB persistence.
5. Haversine geofence evaluation dengan toleransi accuracy yang eksplisit.
6. Upload photo validation/compression/checksum dan atomic attendance event creation.
7. QA khusus iPhone Safari terlebih dahulu.

## Catatan repository lama

Repository `Satyanr/V-Office` dipakai hanya sebagai referensi behavior legacy. Codebase Phase 1 ini sengaja terpisah agar struktur Laravel/MySQL lama tidak menjadi constraint desain baru.
