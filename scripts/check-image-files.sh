#!/usr/bin/env bash
# Refuses an image that holds an environment file or a key (SPC-2026-11-18-001,
# lot Q1). Trivy finds the secrets it has a rule for, not a password in a
# .env file: the image of vms_projects held the .env of production
# (REP-2026-11-17-006). The variables come from the container, never from a
# file in the image.
# Usage: bash scripts/check-image-files.sh <image> [allowed path]...
#   allowed path: a file that may stay, written without the leading "/"
set -euo pipefail

image="${1:?usage: check-image-files.sh <image> [allowed path]...}"
shift
allowed="$(printf '%s\n' "$@")"

container="$(docker create "$image")"
trap 'docker rm "$container" >/dev/null' EXIT

# Environment files anywhere; keys outside the dependencies and the
# certificate folders of the system, which hold public test keys and
# public certificates
found="$(docker export "$container" | tar -t \
  | grep -E '(^|/)(\.env(\.[^/]+)?|[^/]+\.env)$|(^|/)([^/]+\.(key|pem|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)[^/]*|credentials[^/]*\.json)$' \
  | grep -vE '(^|/)node_modules/|^etc/ssl[^/]*/|^usr/share/ca-certificates/|^usr/local/share/ca-certificates/' \
  | grep -vxF -e "$allowed" || true)"

if [[ -n "$found" ]]; then
  echo "The image holds files that must not be published:" >&2
  while IFS= read -r path; do echo "  /$path" >&2; done <<<"$found"
  echo "Give these values to the container instead, or keep them out with .dockerignore." >&2
  exit 1
fi
echo "No environment file or key in $image."
