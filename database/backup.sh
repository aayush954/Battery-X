#!/usr/bin/env bash
# Usage: ./backup.sh  (reads DATABASE_URL from backend/.env)
set -e
source ../backend/.env
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump "$DATABASE_URL" -F c -f "batteryx_backup_${TIMESTAMP}.dump"
echo "Backup written to batteryx_backup_${TIMESTAMP}.dump"
