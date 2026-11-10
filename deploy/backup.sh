#!/bin/sh
# Backup consistente do SQLite (API .backup, segura com WAL) → gzip → Supabase Storage (bucket privado BACKUP_BUCKET).
# Mantém BACKUP_KEEP_DAYS dias. Requer: sqlite3, curl, gzip. Variáveis: DATABASE_PATH, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
set -eu
DB="${DATABASE_PATH:-/data/mobiliza.sqlite}"
BUCKET="${BACKUP_BUCKET:-mobiliza-backups}"
KEEP="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
TMP="/tmp/mobiliza-$STAMP.sqlite"
[ -f "$DB" ] || { echo "[backup] banco não encontrado em $DB"; exit 1; }
: "${SUPABASE_URL:?defina SUPABASE_URL}"; : "${SUPABASE_SERVICE_ROLE_KEY:?defina SUPABASE_SERVICE_ROLE_KEY}"

sqlite3 "$DB" ".backup '$TMP'"
sqlite3 "$TMP" "PRAGMA integrity_check;" | grep -q '^ok$' || { echo "[backup] integrity_check falhou"; exit 1; }
gzip -f "$TMP"
FILE="$TMP.gz"; SIZE=$(wc -c < "$FILE")
KEY="sqlite/$(date -u +%Y/%m)/mobiliza-$STAMP.sqlite.gz"

code=$(curl -sS -o /tmp/backup-resp.txt -w '%{http_code}' -X POST "$SUPABASE_URL/storage/v1/object/$BUCKET/$KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/gzip" -H "x-upsert: true" --data-binary @"$FILE")
rm -f "$FILE"
if [ "$code" != "200" ]; then echo "[backup] upload falhou ($code): $(cat /tmp/backup-resp.txt)"; exit 1; fi
echo "[backup] ok: $KEY ($SIZE bytes)"

# Retenção: remove objetos mais antigos que KEEP dias.
CUTOFF=$(date -u -d "-$KEEP days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
LIST=$(curl -sS -X POST "$SUPABASE_URL/storage/v1/object/list/$BUCKET" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"prefix":"sqlite/","limit":1000,"sortBy":{"column":"created_at","order":"asc"}}' 2>/dev/null || echo '[]')
echo "$LIST" | tr '{' '\n' | grep -o '"name":"[^"]*","created_at":"[^"]*"' | while IFS= read -r line; do
  name=$(echo "$line" | sed 's/.*"name":"\([^"]*\)".*/\1/'); created=$(echo "$line" | sed 's/.*"created_at":"\([^"]*\)".*/\1/')
  if [ "$created" \< "$CUTOFF" ]; then
    curl -sS -o /dev/null -X DELETE "$SUPABASE_URL/storage/v1/object/$BUCKET" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" -d "{\"prefixes\":[\"$name\"]}" && echo "[backup] removido antigo: $name"
  fi
done
