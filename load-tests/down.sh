#!/usr/bin/env bash
# Stops every container of the EV-92 environment (all started with --rm) and
# removes its network. Nothing else is touched.
docker ps -q --filter name='^ev92-' | xargs -r docker stop >/dev/null
docker network rm ev92-net >/dev/null 2>&1 || true
echo "stopped"
