# Update server aktif dengan Tailscale Serve

Panduan ini untuk server yang sudah menjalankan aplikasi dan diakses lewat
`https://nama-server.nama-tailnet.ts.net` melalui Tailscale Serve.

## Apa yang berubah saat pull?

`git pull` memperbarui file yang dilacak Git. Repo ini tidak menjalankan
`tailscale up`, `tailscale serve`, perubahan ACL, DNS, atau firewall. Pengaturan
Tailscale di host tetap milik server. Pull juga tidak menjalankan container.

`.env`, Compose override lokal, dan data runtime tidak dilacak Git. `.env.example`
adalah contoh; perubahan pada contoh tidak menyalin isinya ke `.env` server.
Jangan menyalin ulang `.env.example` di server yang sudah berjalan.

`docker-compose.yml`, `Dockerfile`, `next.config.ts`, dan migration dilacak Git.
Perubahannya dapat memengaruhi aplikasi saat container dibuat ulang. Konfigurasi
server yang masih diedit langsung di file tersebut harus ditinjau sebelum pull;
Git dapat menolak pull atau menghasilkan konflik. Jangan memakai `git reset --hard`
untuk menghilangkan perubahan konfigurasi yang belum disimpan.

Port aplikasi tetap `3000:3000`. Volume tetap bernama `postgres_data`,
`attendance_photos`, dan `leave_files` di bawah project Compose yang sama.
Pertahankan direktori/project Compose dan file `-f` yang selama ini dipakai.
Mengganti nama project dapat membuat Compose memakai volume baru yang tampak kosong.

## Konfigurasi khusus server

Simpan rahasia dan `APP_URL` di `.env` lokal. `APP_URL` harus memakai URL HTTPS
Tailscale server agar tautan email mengarah ke alamat yang bisa dipakai pengguna.
Production menggunakan secure cookie; HTTPS juga diperlukan browser untuk kamera
serta GPS. Hostname Tailscale tidak perlu dimasukkan ke `allowedDevOrigins` untuk
menjalankan production build.

Gunakan `docker-compose.override.yml` untuk perbedaan Compose khusus server.
Nama file tersebut diabaikan Git dan konteks Docker. Contoh pengaturan tambahan:

```yaml
services:
  app:
    environment:
      APP_URL: https://nama-server.nama-tailnet.ts.net
```

Jangan menambahkan override port atau mengganti nama volume tanpa memeriksa hasil
merge Compose. Port/volume dalam beberapa file mengikuti aturan merge Compose;
menambahkan daftar port baru tidak selalu menghapus port dari file dasar.
Jika server selama ini memakai `-f` atau `-p`, gunakan pilihan yang sama pada
semua perintah di bawah.

## Langkah update

Jalankan dari clone yang sama dengan aplikasi server. Catat kondisi awal:

```bash
git status --short
git diff -- docker-compose.yml Dockerfile next.config.ts
docker compose ps
docker compose config --quiet
tailscale status
tailscale serve status
```

Pastikan backup database, foto, dokumen, dan salinan `.env` lokal tersedia di
lokasi aman di luar Git. Backup manual berikut memakai mount backup yang sudah
ada dan tidak menulis ulang konfigurasi. Sintaks kutip tunggal ini juga bisa
digunakan dari PowerShell:

```bash
docker compose run --rm --no-deps --entrypoint /bin/sh backup -c 'set -eu; umask 077; stamp=$(date +%Y%m%d-%H%M%S); PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backup/pre-update-db-$stamp.dump"; tar -czf "/backup/pre-update-photos-$stamp.tar.gz" -C /photos .; tar -czf "/backup/pre-update-leave-$stamp.tar.gz" -C /leave .'
```

Jika perintah backup gagal, selesaikan penyebabnya sebelum memperbarui aplikasi.
Jika memakai `storage/attendance-archive`, salin juga folder tersebut ke backup
terpisah sebelum update; service backup versi lama belum memasukkannya.
Backup database dan file diambil berurutan; jadwalkan ketika tidak ada pengguna
mengirim absensi/dokumen agar isi backup konsisten.

Sesudah perubahan konfigurasi lokal disimpan dan backup berhasil:

```bash
git pull --ff-only
docker compose config --quiet
docker compose build app
docker compose up -d --no-deps app
docker compose up -d --no-deps backup
docker compose ps
docker compose logs --tail 100 app
docker compose logs --tail 50 backup
tailscale serve status
```

Build dilakukan sebelum mengganti container app. Saat container baru dimulai,
Prisma menjalankan migration yang belum diterapkan. Pembaruan kali ini tidak
menambahkan migration atau mereset data. Akan ada jeda singkat saat app dibuat
ulang; Tailscale Serve dapat mengembalikan error sementara selama app belum siap.

Periksa `http://localhost:3000/api/health` pada server dan
`https://nama-server.nama-tailnet.ts.net/api/health` dari perangkat tailnet.
Lanjutkan dengan login admin, lihat laporan, buka foto lama, dan unduh form cuti.
Uji penghapusan pengajuan dengan data uji khusus, bukan data riil yang masih dipakai.

Jangan menjalankan `db:seed` sebagai langkah update rutin: seed memperbarui
password/role admin dari `SEED_ADMIN_*`. Jangan menjalankan `docker compose down -v`
karena pilihan `-v` menghapus volume data.

## Perubahan deployment dalam pembaruan ini

- `NODE_ENV` untuk container app dipastikan `production`, termasuk jika `.env`
  lama masih berisi `NODE_ENV=development`. HTTPS Tailscale tetap dipakai.
- Cloudflare Quick Tunnel menjadi profil opsional `cloudflare`, sehingga update
  Tailscale tidak perlu menjalankan tunnel publik tambahan.
- Backup hanya menerbitkan file lengkap dan menjalankan retensi setelah seluruh
  backup berhasil. File lain di direktori backup tidak dihapus oleh retensi.
- File `.env*`, override lokal, state `.tailscale/`, dan seluruh data `storage/`
  dikecualikan dari konteks build image.
- `fix-portable-clone.ps1` tidak lagi menulis ulang file repo atau konfigurasi.

Container Cloudflare yang sudah berjalan tidak otomatis dimatikan dengan panduan
update app di atas. Periksa `docker ps` jika ingin meninjau tunnel lama. Untuk
menjalankan Quick Tunnel dengan sengaja, gunakan
`docker compose --profile cloudflare up -d tunnel`.

Jika setelah update localhost sehat tetapi URL Tailscale gagal, bandingkan
`tailscale serve status` dengan catatan awal, khususnya port tujuan proxy.
Tidak perlu mereset Tailscale untuk memperbarui aplikasi ini.

## Pemeriksaan developer

`npm run check` menjalankan lint, 26 tes unit/backup, dan production build.
Backup tests pada Windows memerlukan Git Bash pada lokasi instalasi standar.
CI juga menjalankan migration, seed dua kali, serta pengujian penghapusan dengan
PostgreSQL nyata melalui `npm run test:integration`. Pengujian PostgreSQL
memerlukan `TEST_DATABASE_URL` khusus pengujian; skrip tidak memakai `.env` server.

Referensi: [Git pull](https://git-scm.com/docs/git-pull),
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve),
[Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/),
[Compose merge](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/).
