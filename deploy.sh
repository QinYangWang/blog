#!/usr/bin/env bash
# Deploy dist/ to the Cloudflare Pages project `qinyang-wang`.
# Outside Hark, `npx wrangler pages deploy dist --project-name qinyang-wang` does the same.
set -euo pipefail
cd "$(dirname "$0")"
A="${CLOUDFLARE_ACCOUNT_ID:-74550e1c7a5a36e9cb05c5ad681add98}"
P=qinyang-wang
TOOLS="${TOOLS:-$(cd ../tools/node_modules && pwd)}"
API=https://api.cloudflare.com/client/v4/accounts/$A/pages/projects/$P

# 1. upload token (account API token, via the proxy that injects it)
JWT=$(curl -fsS "$API/upload-token" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["jwt"])')
# 2. assets with the JWT, bypassing the proxy so the header is kept
JWT="$JWT" BLAKE3="$TOOLS/blake3-wasm" NO_PROXY='*' no_proxy='*' HTTPS_PROXY= HTTP_PROXY= https_proxy= http_proxy= \
  node scripts/pages-upload.cjs dist .manifest.json
# 3. deployment (account API token again)
curl -fsS -X POST "$API/deployments" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "manifest=<.manifest.json" -F "branch=main" -F "commit_dirty=true" \
  -F "commit_message=novon build $(date -u +%FT%TZ)" \
  -F "_redirects=@dist/_redirects" -F "_headers=@dist/_headers" \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d["result"];print(d["success"], r["id"], r["url"], r.get("aliases"))'
