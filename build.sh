#!/usr/bin/env bash
# Build the site with novon. NOVON points at a novon checkout (bun install done there).
set -euo pipefail
cd "$(dirname "$0")"
NOVON="${NOVON:-../novon}"
bun "$NOVON/bin/novon.ts" build

# Cloudflare Pages serves dir/index.html at /dir/ and 308s /dir -> /dir/.
# The old site used /<slug> with no trailing slash, so flatten every page
# to <route>.html: Pages then serves /<slug> directly.
find dist -mindepth 2 -name index.html | while read -r f; do
  d="$(dirname "$f")"
  mv "$f" "$d.html"
  rmdir "$d" 2>/dev/null || true
done
