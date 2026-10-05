#!/bin/sh
set -eu
until curl -fsS http://storage:5000/status >/dev/null; do sleep 2; done
until curl -fsS -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  http://kong:8000/storage/v1/bucket/avatars >/dev/null; do sleep 2; done
for asset in /payload/assets/avatars/*.png; do
  name=$(basename "$asset")
  curl --fail-with-body -sS -o /dev/null -X POST \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: image/png' -H 'x-upsert: true' \
    --data-binary "@$asset" "http://kong:8000/storage/v1/object/avatars/$name"
done
echo 'Avatar assets seeded.'
