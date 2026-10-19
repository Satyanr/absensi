param([switch]$InitializeEnv)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath 'package.json') -or -not (Test-Path -LiteralPath '.git')) {
  throw 'Jalankan script ini dari root repository absensi.'
}

# Repo files must be updated through Git. Rewriting embedded copies would undo
# deployment fixes and could replace server-specific Compose configuration.
if ($InitializeEnv) {
  if (Test-Path -LiteralPath '.env') {
    Write-Output '.env sudah ada; konfigurasi server dipertahankan.'
  } else {
    Copy-Item -LiteralPath '.env.example' -Destination '.env' -ErrorAction Stop
    Write-Output '.env baru dibuat. Isi credential dan APP_URL sebelum menjalankan aplikasi.'
  }
}

Write-Output 'Tidak ada Dockerfile, Compose, package.json, atau konfigurasi Tailscale yang ditulis ulang.'
Write-Output 'Clone baru: gunakan -InitializeEnv hanya jika .env belum ada, lalu ikuti README.md.'
Write-Output 'Server aktif: ikuti docs/SERVER_UPDATE.md; pertahankan .env dan Compose override server.'
