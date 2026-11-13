#!/bin/bash
# Forced command for the CI deploy key (see setup-vps.sh).
# Reads a gzipped tarball of the site on stdin, unpacks it as a new release
# and switches the `current` symlink to it atomically. Keeps the last 5
# releases so a rollback is just pointing `current` back.
# The symlink is relative so it resolves inside the Caddy container too.
set -euo pipefail
umask 022

ROOT=${VIXE_ROOT:-/home/deploy/sites/vixe}
RELEASES=$ROOT/releases
KEEP=5
MAX_BYTES=$((50 * 1024 * 1024))

name=$(date -u +%Y%m%d%H%M%S)-$$
release=$RELEASES/$name
mkdir -p "$release"
trap 'rm -rf "$release"' ERR

# GNU tar already refuses absolute paths and '..' members.
head -c "$MAX_BYTES" | tar -xz --no-same-owner --no-same-permissions -C "$release"

if [ ! -f "$release/index.html" ]; then
  echo "deploy: index.html missing from upload, aborting" >&2
  exit 1
fi
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +

ln -sfn "releases/$name" "$ROOT/current.tmp"
mv -T "$ROOT/current.tmp" "$ROOT/current"
trap - ERR

ls -1dt "$RELEASES"/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
echo "deploy: live -> $name"
