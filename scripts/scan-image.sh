#!/usr/bin/env bash
# Checks an image before it is merged or published (SPC-2026-11-18-001, lot
# Q1), in the CI of the pull requests and in the publish workflow:
#   - Trivy: a secret, or a critical flaw that has a fix, fails; the high
#     flaws that have a fix are shown;
#   - check-image-files.sh: no environment file and no key in the image.
# Trivy runs from its image, pinned by digest, not from an action.
# Usage: bash scripts/scan-image.sh <image> [allowed path]...
set -euo pipefail

image="${1:?usage: scan-image.sh <image> [allowed path]...}"
trivy_image="aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c"
cache="${TRIVY_CACHE_DIR:-$HOME/.cache/trivy}"
mkdir -p "$cache"

trivy() {
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v "$cache:/root/.cache/trivy" "$trivy_image" \
    image --no-progress "$@" "$image"
}

echo "High flaws that have a fix (shown, not blocking):"
trivy --scanners vuln --severity HIGH --ignore-unfixed
echo "Secrets (blocking):"
trivy --scanners secret --exit-code 1
echo "Critical flaws that have a fix (blocking):"
trivy --scanners vuln --severity CRITICAL --ignore-unfixed --exit-code 1
bash "$(dirname "${BASH_SOURCE[0]}")/check-image-files.sh" "$@"
