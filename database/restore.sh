#!/usr/bin/env bash
# Usage: ./restore.sh path/to/backup.dump
set -e
source ../backend/.env
pg_restore --clean --no-owner -d "$DATABASE_URL" "$1"
echo "Restore complete."
