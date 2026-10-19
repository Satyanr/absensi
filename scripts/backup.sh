#!/bin/sh
set -eu
umask 077

backup_once() (
  backup_dir=${BACKUP_DIR:-/backup}
  photos_dir=${BACKUP_PHOTOS_DIR:-/photos}
  leave_dir=${BACKUP_LEAVE_DIR:-/leave}
  archive_dir=${BACKUP_ARCHIVE_DIR:-/photos-archive}
  stamp=$(date +%Y%m%d-%H%M%S)-$$
  mkdir -p "$backup_dir"

  db="$backup_dir/db-$stamp.dump"
  photos="$backup_dir/photos-$stamp.tar.gz"
  leave="$backup_dir/leave-$stamp.tar.gz"
  archive="$backup_dir/archive-photos-$stamp.tar.gz"
  # Never publish a partial dump or rotate older backups after a failed run.
  trap 'rm -f "$db.partial" "$photos.partial" "$leave.partial" "$archive.partial"' EXIT
  PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
    -h "${BACKUP_DB_HOST:-postgres}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -Fc -f "$db.partial"
  tar -czf "$photos.partial" -C "$photos_dir" .
  tar -czf "$leave.partial" -C "$leave_dir" .
  if [ -d "$archive_dir" ]; then
    tar -czf "$archive.partial" -C "$archive_dir" .
  fi
  mv "$db.partial" "$db"
  mv "$photos.partial" "$photos"
  mv "$leave.partial" "$leave"
  if [ -f "$archive.partial" ]; then mv "$archive.partial" "$archive"; fi
  find "$backup_dir" -maxdepth 1 -type f \
    \( -name 'db-*.dump' -o -name 'photos-*.tar.gz' -o -name 'leave-*.tar.gz' -o -name 'archive-photos-*.tar.gz' \) \
    -mtime +14 -delete
  echo "Backup selesai: $stamp"
)

if [ "${1:-}" = '--once' ]; then
  backup_once
  exit 0
fi

while true; do
  # Run a separate shell: set -e remains effective even when failure is handled.
  if /bin/sh "$0" --once; then
    :
  else
    echo 'Backup gagal. Backup lengkap sebelumnya dipertahankan.' >&2
  fi
  sleep 86400
done
