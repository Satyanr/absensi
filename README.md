# Sistem Absensi Karyawan

Aplikasi absensi internal berbasis web untuk mencatat kehadiran karyawan, absensi kantor dengan GPS/geofence dan selfie, absensi **In Project**, pengajuan izin/sakit/cuti, pengelolaan karyawan & user, notifikasi email, serta laporan periode yang dapat diekspor.

> Stack utama: **Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 17 · Prisma 7 · Zod · Docker Compose · Cloudflare Quick Tunnel**

## Fitur Utama

### Karyawan

- Pencarian karyawan menggunakan kode seperti `EMP000`.
- Absensi **Kantor** dengan:
  - GPS berakurasi tinggi.
  - Validasi geofence kantor.
  - Reverse geocoding alamat melalui Geoapify (bila API key tersedia).
  - Selfie melalui kamera browser atau fallback file capture.
  - Absen masuk dan absen pulang.
- Absensi **In Project**:
  - Jam fleksibel.
  - GPS bersifat opsional saat check-in.
  - Tidak membutuhkan absen pulang.
- Status absensi hari ini ditampilkan setelah identitas karyawan ditemukan.
- Pengajuan **Izin / Sakit / Cuti** tanpa login employee.
- Kode karyawan pada halaman pengajuan otomatis menggunakan prefix `EMP`.
- Pengajuan Izin/Sakit dapat melampirkan gambar atau PDF maksimal 5 MB.
- Pengajuan Cuti Tahunan dapat:
  1. membuat/download Form Pengajuan Cuti `.docx`,
  2. dilengkapi manual,
  3. di-upload kembali untuk proses persetujuan admin.

### Admin & Leader

- Dashboard kehadiran hari ini.
- Ringkasan karyawan aktif, hadir, kantor, In Project, dan terlambat.
- Pengelolaan data karyawan: tambah, edit, cari, aktif/nonaktif.
- Pengelolaan akun **Admin** dan **Leader** (khusus Admin).
- Pengelolaan izin/sakit/cuti:
  - pencarian berdasarkan nama, kode karyawan, atau alasan,
  - approval/rejection,
  - saldo cuti,
  - penyesuaian pengajuan,
  - lampiran pemohon,
  - dokumen final cuti.
- Histori notifikasi email dengan status Pending / Terkirim / Gagal dan retry untuk email gagal.
- Laporan berdasarkan:
  - tanggal awal & akhir,
  - karyawan,
  - mode absensi (Semua / Kantor / In Project).
- Ekspor **Excel Lengkap** dan **CSV Ringkas**.
- Laporan menggabungkan data absensi dan pengajuan Izin/Sakit/Cuti yang sudah disetujui.
- Foto masuk/pulang dan lokasi dapat dilihat dari detail laporan bila tersedia.

## Hak Akses

| Role | Dashboard | Karyawan | User | Notifikasi | Laporan | Izin & Cuti |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leader | ✓ | ✓ | — | — | ✓ | ✓ |
| Employee | Halaman publik absensi | — | — | — | — | Halaman publik pengajuan |

## Teknologi

- **Frontend/Backend**: Next.js App Router, React, TypeScript
- **UI**: Tailwind CSS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: Zod
- **Authentication**: session cookie HTTP-only dengan opaque token
- **Password hashing**: bcrypt
- **Spreadsheet export**: ExcelJS
- **Document generation**: docxtemplater + PizZip
- **Email**: Nodemailer / SMTP
- **Runtime**: Docker Compose
- **Public HTTPS (opsional/dev)**: Cloudflare Quick Tunnel

## Struktur Halaman

```text
/
├─ /                     # Absensi karyawan
├─ /leave                # Izin / Sakit / Cuti
└─ /admin
   ├─ /login
   ├─ /dashboard
   ├─ /employees
   ├─ /users             # Admin only
   ├─ /notifications     # Admin only
   ├─ /reports
   └─ /leaves
```

## Persyaratan

### Opsi Docker

- Docker Engine / Docker Desktop
- Docker Compose v2

### Opsi Development Lokal

- Node.js yang kompatibel dengan Next.js 16
- npm
- PostgreSQL 17 (atau kompatibel)

## Environment

Salin file contoh:

```bash
cp .env.example .env
```

Konfigurasi penting:

```env
NODE_ENV=development
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

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM_NAME=Sistem Absensi
MAIL_FROM_EMAIL=

GEOAPIFY_API_KEY=
MAX_OFFICE_GPS_ACCURACY_METERS=500
MAX_GPS_AGE_SECONDS=120
MAX_GPS_FUTURE_SKEW_SECONDS=30

OFFICE_JAKARTA_LATITUDE=
OFFICE_JAKARTA_LONGITUDE=
OFFICE_BANDUNG_LATITUDE=
OFFICE_BANDUNG_LONGITUDE=
OFFICE_JOGJA_LATITUDE=
OFFICE_JOGJA_LONGITUDE=
OFFICE_SURABAYA_LATITUDE=
OFFICE_SURABAYA_LONGITUDE=
```

### Default akun seed untuk development

```text
Email    : admin@example.local
Username : admin
Password : ChangeMe123!
Role     : ADMIN
```

> **Wajib diganti sebelum digunakan di lingkungan production.**

## Menjalankan dengan Docker Compose

```bash
docker compose up -d --build
```

Jalankan migration database:

```bash
docker compose exec app npm run db:deploy
```

Jalankan seed awal:

```bash
docker compose exec app npm run db:seed
```

Aplikasi lokal:

```text
http://localhost:3000
```

Admin:

```text
http://localhost:3000/admin/login
```

Health check:

```text
http://localhost:3000/api/health
```

### URL HTTPS Cloudflare Quick Tunnel

```bash
docker compose logs tunnel
```

Cari URL seperti:

```text
https://xxxxx.trycloudflare.com
```

> Quick Tunnel cocok untuk development/testing. URL **tidak permanen** dan dapat berubah setelah tunnel dibuat ulang atau container restart.

## Development Lokal

Jalankan PostgreSQL:

```bash
docker compose up -d postgres
```

Pastikan `DATABASE_URL` mengarah ke `localhost:5432`, lalu:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Kebijakan Absensi Default

Seed membuat policy default:

| Pengaturan | Nilai |
|---|---|
| Mulai kerja | 08:00 |
| Terlambat setelah | 08:15 |
| Jam pulang | 17:00 |
| Lembur setelah | 19:00 |
| Timezone | Asia/Jakarta |
| Weekend | dihitung lembur |

Lokasi kantor (Jakarta, Bandung, Jogja, Surabaya) hanya dibuat apabila koordinat masing-masing sudah diisi melalui environment variable. Radius seed default adalah **1.000 meter**.

## Storage

- Foto absensi: `storage/attendance`
- Lampiran izin/sakit/cuti: `storage/leave`
- Backup: `storage/backup`
- Template cuti: `resources/templates/form-pengajuan-cuti.docx`

File upload disimpan di filesystem, sedangkan metadata/path/checksum disimpan di database.

## Backup

Service `backup` pada Docker Compose melakukan backup setiap 24 jam dan menghapus file lebih tua dari 14 hari.

Backup yang saat ini dibuat:

```text
storage/backup/db-YYYYMMDD-HHMMSS.dump
storage/backup/photos-YYYYMMDD-HHMMSS.tar.gz
```

> **Catatan:** pada konfigurasi Docker Compose saat ini, backup volume baru mencakup database dan `attendance_photos`. Lampiran `storage/leave` belum dipasang sebagai volume backup terpisah.

## Keamanan

- Session menggunakan opaque random token.
- Browser menerima session melalui cookie HTTP-only.
- Database menyimpan hash token, bukan raw session token.
- Password menggunakan bcrypt.
- Validasi file memeriksa signature/isi file, tidak hanya ekstensi/MIME browser.
- Foto/lampiran tidak disimpan sebagai binary database.
- Endpoint admin memiliki pemeriksaan role.

### Hal yang wajib dibereskan sebelum production

1. **Jangan commit file upload karyawan ke Git.**
   Tambahkan `storage/leave/*` ke `.gitignore` (dengan `.gitkeep` bila diperlukan) dan pindahkan file yang sudah terlanjur masuk Git/history.
2. **Persist `storage/leave` sebagai volume Docker** dan masukkan ke strategi backup.
3. **Perbaiki wiring password database pada Docker Compose.** Saat ini `app.environment.DATABASE_URL` masih menggunakan password `change-me-local-only` secara hard-coded. Jika `POSTGRES_PASSWORD` diubah, URL aplikasi juga harus konsisten.
4. Ganti akun/password seed default.
5. Gunakan SMTP credential production yang aman dan jangan commit `.env`.
6. Quick Tunnel bukan hostname production permanen; gunakan tunnel/hostname permanen apabila URL stabil menjadi kebutuhan.

## Known Notes pada Repository Saat Ini

- README lama masih mendeskripsikan project sebagai "Phase 1", sementara fitur attendance, admin CRUD, laporan, izin/cuti, email notification, dan UI sudah tersedia.
- `storage/leave` belum tercakup oleh `.gitignore` maupun volume backup di Docker Compose.
- `docker-compose.yml` meng-override `DATABASE_URL` aplikasi dengan password default hard-coded.

README ini sengaja mendokumentasikan kondisi aplikasi saat ini dan menandai gap deployment yang perlu dibereskan, bukan menyembunyikannya.

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # production server
npm run lint         # ESLint
npm run db:generate  # Prisma generate
npm run db:migrate   # Prisma migrate dev
npm run db:deploy    # Prisma migrate deploy
npm run db:seed      # seed admin/policy/offices
```

## Lisensi

Repository saat ini belum mendefinisikan file lisensi. Tambahkan `LICENSE` apabila project akan didistribusikan atau digunakan di luar lingkungan internal.
