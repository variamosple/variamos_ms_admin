#!/usr/bin/env bash
# Runs the VariaMos development kit with the code of this repository
# (SPC-2026-11-18-001, lot A2): the rest of the platform runs its main
# images, with a sanitized copy of the production database.
#   npm run kit        build this repository and start the kit with it
#   npm run kit:stop   stop the kit (its database is kept)
# The kit is looked for in KIT_DIR, then next to this repository.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
kit_dir="${KIT_DIR:-$(dirname "$repo")/variamos_dev_kit}"

if [[ ! -x "$kit_dir/kit" ]]; then
  echo "The development kit is not in $kit_dir. Clone it next to this repository:" >&2
  echo "  git clone https://github.com/variamosple/variamos_dev_kit.git \"$kit_dir\"" >&2
  echo "or give its folder: KIT_DIR=/path/to/variamos_dev_kit npm run kit" >&2
  exit 1
fi

case "${1:-}" in
  start) exec "$kit_dir/kit" build "$repo" ;;
  stop) exec "$kit_dir/kit" down ;;
  *)
    echo "Usage: bash scripts/kit.sh start|stop" >&2
    exit 1
    ;;
esac
