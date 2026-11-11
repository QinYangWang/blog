#!/usr/bin/env bash
# Build the site with novon. NOVON points at a novon checkout (bun install done there).
set -euo pipefail
cd "$(dirname "$0")"
NOVON="${NOVON:-../novon}"
bun "$NOVON/bin/novon.ts" build