# Sistem Absensi Karyawan

Aplikasi absensi internal berbasis web untuk mencatat kehadiran personel, absensi kantor dengan GPS/geofence dan selfie, absensi **In Project**, pengajuan izin/sakit/cuti, pengelolaan personel & user, notifikasi email, serta laporan periode yang dapat diekspor.

> Stack utama: **Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 17 · Prisma 7 · Docker Compose**

## Fitur Utama

- Absensi Kantor dengan GPS/geofence, reverse geocoding, selfie, check-in, dan check-out.
- Absensi **In Project** dengan jam fleksibel.
- Personel **Karyawan** dan **Magang**.
- Pengajuan **Izin / Sakit / Cuti** tanpa login employee.
- Admin/Leader untuk dashboard, data personel, approval, saldo cuti, notifikasi, dan laporan.
- Ekspor **Excel Lengkap** dan **CSV Ringkas**.
- Rekap Excel mencakup keterlambatan, pulang awal, lembur, izin, sakit, dan cuti.

## Hak Akses

| Role | Dashboard | Personel | User | Notifikasi | Laporan | Izin & Cuti |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leader | ✓ | ✓ | — | — | ✓ | ✓ |
| Employee | Halaman publik | — | — | — | — | Halaman publik |

# Clone & Setup di Device Baru

Panduan ini berlaku untuk **Windows, macOS, dan Linux**. Untuk hasil paling konsisten antar-device, gunakan **Docker Compose**.

## 1. Persyaratan

### Direkomendasikan: Docker

Install:

- Git
- Docker Desktop (Windows/macOS) atau Docker Engine (Linux)
- Docker Compose v2

Cek:

```bash
git --version
docker --version
docker compose version
```

### Development lokal

Tambahan:

- **Node.js 22**
- npm

Repository menyediakan `.nvmrc`.

```bash
nvm install 22
nvm use 22
node --version
npm --version
```

## 2. Clone Repository

```bash
git clone https://github.com/Satyanr/absensi.git
cd absensi
git pull origin main
```

## 3. Buat `.env`

`.env` tidak disimpan di Git dan harus dibuat di setiap device.

### Windows PowerShell

```powershell
Copy-Item .env.example .env
notepad .env
```

### macOS / Linux

```bash
cp .env.example .env
```

Konfigurasi dasar:

```env
APP_URL=http://localhost:3000
APP_TIMEZONE=Asia/Jakarta
SESSION_COOKIE_NAME=absensi_session
SESSION_TTL_HOURS=24

POSTGRES_DB=absensi
POSTGRES_USER=absensi
POSTGRES_PASSWORD=change-me-local-only
DATABASE_URL=postgresql://absensi:change-me-local-only@localhost:5432/absensi?schema=public

SEED_ADMIN_EMAIL=admin@example.local
SEED_ADMIN_PASSWORD=ChangeMe123!
SEED_ADMIN_NAME=Administrator
```

Konfigurasi opsional:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM_NAME=Sistem Absensi
MAIL_FROM_EMAIL=

GEOAPIFY_API_KEY=

OFFICE_JAKARTA_LATITUDE=
OFFICE_JAKARTA_LONGITUDE=
OFFICE_BANDUNG_LATITUDE=
OFFICE_BANDUNG_LONGITUDE=
OFFICE_JOGJA_LATITUDE=
OFFICE_JOGJA_LONGITUDE=
OFFICE_SURABAYA_LATITUDE=
OFFICE_SURABAYA_LONGITUDE=
```

> Jangan commit `.env`, password, SMTP credential, atau API key ke Git.

# Menjalankan dengan Docker Compose

## 1. Build dan jalankan

```bash
docker compose up -d --build
```

Container aplikasi otomatis menjalankan Prisma migration saat startup.

Cek:

```bash
docker compose ps
docker compose logs -f app
```

## 2. Seed database baru

```bash
docker compose exec app npm run db:seed
```

Default development seed:

```text
Email    : admin@example.local
Username : admin
Password : ChangeMe123!
Role     : ADMIN
```

Ganti credential sebelum production.

## 3. Akses

```text
Aplikasi : http://localhost:3000
Admin    : http://localhost:3000/admin/login
Health   : http://localhost:3000/api/health
```

## 4. Verifikasi clean build

```bash
docker compose build --no-cache app
```

# Development Lokal

Gunakan ini bila Next.js dijalankan langsung dari host dan PostgreSQL menggunakan Docker.

```bash
docker compose up -d postgres
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Untuk mode ini, `DATABASE_URL` harus mengarah ke `localhost:5432`.

Gunakan **`npm ci`**, bukan `npm install`, untuk instalasi normal dari repository agar dependency mengikuti `package-lock.json`.

# Pemeriksaan Sebelum Commit

```bash
npm ci
npm run check
```

`npm run check` menjalankan ESLint dan production build.

Untuk perubahan Docker/dependency:

```bash
docker compose config
docker compose build --no-cache app
```

# Update Repository yang Sudah Pernah Di-clone

Development lokal:

```bash
git status
git pull origin main
npm ci
```

Docker:

```bash
git pull origin main
docker compose up -d --build
```

# Storage

Runtime file tidak disimpan di Git.

- Foto absensi: `storage/attendance`
- Lampiran izin/sakit/cuti: `storage/leave`
- Backup: `storage/backup`
- Template cuti: `resources/templates/form-pengajuan-cuti.docx`

Docker Compose menggunakan volume terpisah untuk foto absensi dan file leave agar data tidak hilang saat container dibuat ulang.

# Backup

Service `backup` berjalan setiap 24 jam dan menghapus backup lebih lama dari 14 hari.

```text
storage/backup/db-YYYYMMDD-HHMMSS.dump
storage/backup/photos-YYYYMMDD-HHMMSS.tar.gz
storage/backup/leave-YYYYMMDD-HHMMSS.tar.gz
```

Simpan salinan backup penting di luar device/server utama.

# Cloudflare Quick Tunnel

Untuk development/testing:

```bash
docker compose logs tunnel
```

Cari URL seperti:

```text
https://xxxxx.trycloudflare.com
```

Quick Tunnel bukan hostname production permanen dan URL dapat berubah.

# Kebijakan Absensi Default

| Pengaturan | Nilai |
|---|---|
| Mulai kerja | 08:00 |
| Terlambat setelah | 08:15 |
| Jam pulang | 17:00 |
| Lembur setelah | 19:00 |
| Timezone | Asia/Jakarta |
| Weekend | dihitung lembur |

Lokasi Jakarta, Bandung, Jogja, dan Surabaya hanya dibuat jika koordinat environment sudah diisi. Radius default seed adalah **1.000 meter**.

# Scripts

```bash
npm run dev          # Development server
npm run check        # ESLint + production build
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint
npm run db:generate  # Prisma generate
npm run db:migrate   # Prisma migrate dev
npm run db:deploy    # Prisma migrate deploy
npm run db:seed      # Seed admin, policy, lokasi kantor
```

# Troubleshooting Fresh Clone

### `npm ci` gagal karena lockfile tidak sinkron

Perbaiki dan commit `package-lock.json`. Jangan mengganti workflow normal menjadi `npm install` hanya untuk menghindari error.

### `eslint` tidak ditemukan

Pastikan `npm ci` selesai tanpa error.

### Database tidak terhubung

- Development lokal: host database `localhost`.
- Container app: Docker Compose otomatis memakai host `postgres`.

Pastikan `POSTGRES_DB`, `POSTGRES_USER`, dan `POSTGRES_PASSWORD` konsisten.

### Port 3000 atau 5432 sudah dipakai

Hentikan service lain yang memakai port tersebut atau ubah port mapping lokal.

### Docker memakai source/build lama

```bash
docker compose build --no-cache app
docker compose up -d app
```

# Catatan Production

- Ganti credential default.
- Simpan SMTP/API key di environment/secret manager.
- Gunakan hostname/tunnel permanen.
- Backup database dan storage ke lokasi eksternal.
- Jangan commit `.env`, foto absensi, dokumen cuti, atau data runtime ke Git.
