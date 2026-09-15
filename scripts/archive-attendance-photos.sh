#!/bin/sh
set -eu

source_root="${ATTENDANCE_ARCHIVE_SOURCE_PATH:-/photos}"
archive_root="${ATTENDANCE_ARCHIVE_DESTINATION_PATH:-/archive}"
archive_after_days="${ATTENDANCE_ARCHIVE_AFTER_DAYS:-7}"

case "$archive_after_days" in
  ""|*[!0-9]*)
    echo "[photo-archiver] ATTENDANCE_ARCHIVE_AFTER_DAYS harus berupa angka." >&2
    exit 1
    ;;
esac

if [ "$archive_after_days" -lt 1 ]; then
  echo "[photo-archiver] ATTENDANCE_ARCHIVE_AFTER_DAYS minimal 1 hari." >&2
  exit 1
fi

if [ ! -d "$source_root" ]; then
  echo "[photo-archiver] Source tidak ditemukan: $source_root" >&2
  exit 1
fi

mkdir -p "$archive_root"

# find -mtime menggunakan unit 24 jam yang dibulatkan ke bawah.
# +6 berarti file sudah berumur setidaknya 7 x 24 jam.
mtime_threshold=$((archive_after_days - 1))

echo "[photo-archiver] Memindahkan foto >= ${archive_after_days} hari dari $source_root ke $archive_root"

find "$source_root" \
  -type f \
  ! -name ".gitkeep" \
  -mtime "+$mtime_threshold" \
  -exec sh -c '
    source_root="$1"
    archive_root="$2"
    shift 2

    for source_file do
      relative_path="${source_file#"$source_root"/}"
      destination_file="$archive_root/$relative_path"

      if [ -e "$destination_file" ]; then
        echo "[photo-archiver] SKIP tujuan sudah ada: $relative_path" >&2
        continue
      fi

      mkdir -p "$(dirname "$destination_file")"

      if mv "$source_file" "$destination_file"; then
        echo "[photo-archiver] MOVED $relative_path"
      else
        echo "[photo-archiver] GAGAL $relative_path" >&2
      fi
    done
  ' sh "$source_root" "$archive_root" {} +

find "$source_root" -mindepth 1 -type d -empty -delete

echo "[photo-archiver] Selesai."
