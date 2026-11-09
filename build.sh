#!/usr/bin/env bash
# Build the site with novon. NOVON points at a novon checkout (bun install done there).
# Header images are generated first: they are build output, not files in git.
set -euo pipefail
cd "$(dirname "$0")"
NOVON="${NOVON:-../novon}"
bun scripts/generate-covers.ts
bun "$NOVON/bin/novon.ts" build
