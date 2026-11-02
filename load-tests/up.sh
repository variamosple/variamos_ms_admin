#!/usr/bin/env bash
# Starts the local load test environment of EV-92 on an internal Docker
# network (no request leaves the machine): a disposable PostgreSQL 14 with the
# schema of the frontend end-to-end tests, seven stand-in services that answer
# /health, and the admin image. Every value here is a throwaway made for this
# test; no production file is read.
# Usage: up.sh <admin image> <keys dir> <VariaMosAdmin dir>
set -euo pipefail
IMAGE=${1:?admin image}
KEYS=${2:?directory holding jwtRS256.key and jwtRS256.key.pub}
FRONT=${3:?VariaMosAdmin checkout, for tests/db}
NET=ev92-net
DB_PASSWORD=loadtest-only

docker network create --internal $NET >/dev/null
docker run -d --rm --name ev92-pg --network $NET \
  -e POSTGRES_USER=variamos_admin -e POSTGRES_PASSWORD=$DB_PASSWORD -e POSTGRES_DB=VariamosDB \
  postgres:14-alpine >/dev/null
until docker exec ev92-pg pg_isready -q -U variamos_admin -d VariamosDB; do sleep 1; done
sleep 2
psql_in() { docker exec -i "$@" ev92-pg psql -q -U variamos_admin -d VariamosDB -v ON_ERROR_STOP=1; }
psql_in < "$FRONT/tests/db/VariamosDB.sql" >/dev/null
psql_in -e PGOPTIONS="-c search_path=variamos,public" < "$FRONT/tests/db/config.sql" >/dev/null

# Stand-ins for the monitored services: the admin lists them through Docker
# and checks their /health every 30 s, as in production
SERVICES="variamos_ms_languages vms_projects variamos_ms_notifications semantic_translator vms_domain_application vms_requirements_autocomplete variamos_ms_metrics"
for name in $SERVICES; do
  host=${name//_/-}
  docker run -d --rm --name "ev92-$host" --network $NET --network-alias "$host" \
    --label variamos.service.monitored=true \
    --label "variamos.service.name=$name" \
    --label "com.docker.compose.service=$host" \
    --label variamos.service.internal-port=8080 \
    --label variamos.service.health-path=/health \
    busybox:1.36 sh -c 'mkdir -p /www && echo "{\"status\":\"UP\"}" > /www/health && httpd -f -p 8080 -h /www' >/dev/null
done

docker run -d --rm --name ev92-admin --network $NET \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$KEYS/jwtRS256.key:/keys/jwtRS256.key:ro" \
  -v "$KEYS/jwtRS256.key.pub:/keys/jwtRS256.key.pub:ro" \
  --label variamos.service.monitored=true \
  --label variamos.service.name=variamos_ms_admin \
  --label com.docker.compose.service=ev92-admin \
  --label variamos.service.internal-port=4000 \
  --label variamos.service.health-path=/health \
  -e NODE_ENV=production -e PORT=4000 \
  -e DB_HOST=ev92-pg -e DB_PORT=5432 -e DB_USER=variamos_admin \
  -e DB_PASSWORD=$DB_PASSWORD -e DB_DATABASE=VariamosDB -e DB_SCHEMA=variamos -e DB_SSL=false \
  -e VARIAMOS_PRIVATE_KEY_PATH=/keys/jwtRS256.key -e VARIAMOS_PUBLIC_KEY_PATH=/keys/jwtRS256.key.pub \
  -e COOKIE_SECRET=loadtest-only-cookie-secret -e COOKIE_PATH=/ -e COOKIE_EXP_IN_MS=1200000 \
  -e SECURE_COOKIE=false -e CORS_ALLOWED_ORIGINS_PATTERNS=http://localhost:3000 \
  -e DOCKER_SOCKET_PATH=/var/run/docker.sock \
  -e GITHUB_MANAGED_REPOS=loadtest/repo-1,loadtest/repo-2,loadtest/repo-3 \
  -e NOTIFICATION_SERVICE_URL=http://ev92-notifications-absent:3005 \
  -e NOTIFICATION_INTERNAL_TOKEN=loadtest-only-token \
  --user root \
  "$IMAGE" >/dev/null
until docker logs ev92-admin 2>&1 | grep -q "Express server started"; do sleep 1; done
echo "started: ev92-admin (migrations applied), ev92-pg, $(echo $SERVICES | wc -w) stand-in services"
