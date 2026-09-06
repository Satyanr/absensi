$ErrorActionPreference = 'Stop'

if (-not (Test-Path 'package.json') -or -not (Test-Path '.git')) {
  throw 'Jalankan script ini dari root repository absensi.'
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $fullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
  $directory = [System.IO.Path]::GetDirectoryName($fullPath)

  if ($directory -and -not [System.IO.Directory]::Exists($directory)) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }

  [System.IO.File]::WriteAllText($fullPath, ($Content.TrimEnd() + "`n"), $Utf8NoBom)
}

$content1 = @'
# Dependencies / build output
node_modules/
.next/
coverage/
npm-debug.log*
*.tsbuildinfo

# Local environment files
.env
.env.local
.env.*.local

# Runtime storage (keep directory placeholders only)
storage/attendance/**
!storage/attendance/.gitkeep

storage/leave/**
!storage/leave/.gitkeep

storage/backup/**
!storage/backup/.gitkeep
'@
Write-Utf8NoBom '.gitignore' $content1

$content2 = @'
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma 7 reads DATABASE_URL while loading prisma.config.ts.
# This build-only URL is intentionally non-secret and is not copied to the runtime stage.
ENV DATABASE_URL=postgresql://absensi:build-only@127.0.0.1:5432/absensi?schema=public
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
RUN mkdir -p /app/storage/attendance /app/storage/leave \
    && chown -R nextjs:nodejs /app/storage
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
'@
Write-Utf8NoBom 'Dockerfile' $content2

$content3 = @'
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-absensi}
      POSTGRES_USER: ${POSTGRES_USER:-absensi}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change-me-local-only}
      TZ: Asia/Jakarta
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -U ${POSTGRES_USER:-absensi} -d ${POSTGRES_DB:-absensi}",
        ]
      interval: 5s
      timeout: 5s
      retries: 15

  app:
    build: .
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      DATABASE_URL: "postgresql://${POSTGRES_USER:-absensi}:${POSTGRES_PASSWORD:-change-me-local-only}@postgres:5432/${POSTGRES_DB:-absensi}?schema=public"
    volumes:
      - attendance_photos:/app/storage/attendance
      - leave_files:/app/storage/leave
    ports:
      - "3000:3000"

  tunnel:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    depends_on:
      - app
    command: tunnel --no-autoupdate --url http://app:3000

  backup:
    image: postgres:17-alpine
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env
    volumes:
      - ./storage/backup:/backup
      - attendance_photos:/photos:ro
      - leave_files:/leave:ro
    entrypoint: ["/bin/sh", "-c"]
    command: >-
      while true; do
        stamp=$$(date +%Y%m%d-%H%M%S);
        PGPASSWORD=$$POSTGRES_PASSWORD pg_dump
        -h postgres
        -U $$POSTGRES_USER
        -d $$POSTGRES_DB
        -Fc
        -f /backup/db-$$stamp.dump;
        tar -czf /backup/photos-$$stamp.tar.gz -C /photos .;
        tar -czf /backup/leave-$$stamp.tar.gz -C /leave .;
        find /backup -type f -mtime +14 -delete;
        sleep 86400;
      done

volumes:
  postgres_data:
  attendance_photos:
  leave_files:
'@
Write-Utf8NoBom 'docker-compose.yml' $content3

$content4 = @'
{
  "name": "absensi-internal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "prebuild": "prisma generate",
    "build": "next build",
    "start": "next start -H 0.0.0.0 -p 3000",
    "lint": "eslint .",
    "check": "npm run lint && npm run build",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "bcryptjs": "3.0.2",
    "docxtemplater": "^3.69.3",
    "dotenv": "17.2.2",
    "exceljs": "^4.4.0",
    "next": "16.3.3",
    "nodemailer": "^9.1.1",
    "pg": "8.16.3",
    "pizzip": "^3.2.0",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "zod": "4.1.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "24.3.0",
    "@types/nodemailer": "^8.0.1",
    "@types/pg": "8.15.5",
    "@types/react": "19.1.12",
    "@types/react-dom": "19.1.9",
    "eslint": "9.34.0",
    "eslint-config-next": "16.3.3",
    "postcss": "8.5.6",
    "prisma": "7.10.0",
    "tailwindcss": "4.3.3",
    "tsx": "4.20.5",
    "typescript": "5.9.2"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "type": "module"
}
'@
Write-Utf8NoBom 'package.json' $content4

$content5 = @'
* text=auto
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.mjs text eol=lf
*.json text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
Dockerfile text eol=lf
*.sh text eol=lf

*.png binary
*.jpg binary
*.jpeg binary
*.webp binary
*.pdf binary
*.docx binary
*.xlsx binary
'@
Write-Utf8NoBom '.gitattributes' $content5

$content6 = @'
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  app-check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_DB: absensi
          POSTGRES_USER: absensi
          POSTGRES_PASSWORD: ci-only-password
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U absensi -d absensi"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 15
    env:
      DATABASE_URL: postgresql://absensi:ci-only-password@localhost:5432/absensi?schema=public
      APP_URL: http://localhost:3000
      APP_TIMEZONE: Asia/Jakarta
      SEED_ADMIN_EMAIL: admin@example.local
      SEED_ADMIN_PASSWORD: ChangeMe123!
      SEED_ADMIN_NAME: Administrator
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run db:deploy
      - run: npm run db:seed
      - run: npm run check

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t absensi-ci .
'@
Write-Utf8NoBom '.github/workflows/ci.yml' $content6

[System.IO.File]::WriteAllText(
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location) '.nvmrc')),
  "22`n",
  [System.Text.Encoding]::ASCII
)

New-Item -ItemType Directory -Force 'storage/leave' | Out-Null
if (-not (Test-Path 'storage/leave/.gitkeep')) {
  New-Item -ItemType File 'storage/leave/.gitkeep' | Out-Null
}

# Stop tracking runtime uploads, but keep the actual files on this machine.
git rm -r --cached --ignore-unmatch storage/leave | Out-Null

git add .gitignore Dockerfile docker-compose.yml package.json .nvmrc .gitattributes .github/workflows/ci.yml storage/leave/.gitkeep

Write-Host ''
Write-Host 'Perubahan portability sudah disiapkan di working tree.' -ForegroundColor Green
Write-Host 'Review dulu:' -ForegroundColor Yellow
Write-Host '  git status'
Write-Host '  git diff -- . ":(exclude)storage/leave"'
Write-Host ''
Write-Host 'Lalu validasi:' -ForegroundColor Yellow
Write-Host '  Copy-Item .env.example .env   # jika .env belum ada'
Write-Host '  npm ci'
Write-Host '  npm run check'
Write-Host '  docker compose config'
Write-Host '  docker compose build app'
Write-Host ''
Write-Host 'Jika semua lolos, commit & push:' -ForegroundColor Yellow
Write-Host '  git commit -m "chore: make fresh clone reproducible"'
Write-Host '  git push origin main'
