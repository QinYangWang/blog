// Uploads dist/ assets to Cloudflare Pages with an upload JWT and writes the
// manifest (path -> hash) for the deployment call.
//
// Same protocol wrangler uses (check-missing, assets/upload, upsert-hashes).
// It exists because the Hark egress proxy replaces any Authorization header
// on api.cloudflare.com with the account API token, which breaks wrangler's
// JWT-authenticated asset calls; this script makes those calls directly.
// Normal environments can just run `wrangler pages deploy dist`.
//
// Usage: JWT=... node scripts/pages-upload.cjs dist manifest.json
const fs = require('node:fs')
const path = require('node:path')
const { hash } = require(process.env.BLAKE3 || 'blake3-wasm')

const [dir, out] = process.argv.slice(2)
const JWT = process.env.JWT
const API = 'https://api.cloudflare.com/client/v4'
const SKIP = new Set(['_redirects', '_headers', '_routes.json', '_worker.js', '.DS_Store'])
const MIME = {
  html: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json',
  xml: 'application/xml', txt: 'text/plain', md: 'text/markdown', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff2: 'font/woff2', woff: 'font/woff',
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(d, e.name)
    if (e.isDirectory()) return walk(full)
    if (d === dir && SKIP.has(e.name)) return []
    return [full]
  })
}

async function api(route, body) {
  const res = await fetch(API + route, {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.success) throw new Error(`${route}: ${JSON.stringify(json.errors)}`)
  return json.result
}

;(async () => {
  const files = walk(dir).map((full) => {
    const rel = '/' + path.relative(dir, full).split(path.sep).join('/')
    const b64 = fs.readFileSync(full).toString('base64')
    const ext = path.extname(full).slice(1).toLowerCase()
    return { rel, b64, ext, hash: hash(b64 + ext).toString('hex').slice(0, 32) }
  })
  const manifest = Object.fromEntries(files.map((f) => [f.rel, f.hash]))
  const missing = new Set(await api('/pages/assets/check-missing', { hashes: [...new Set(files.map((f) => f.hash))] }))
  const todo = files.filter((f) => missing.has(f.hash)).filter((f, i, a) => a.findIndex((g) => g.hash === f.hash) === i)
  let batch = []
  let size = 0
  const flush = async () => {
    if (!batch.length) return
    await api('/pages/assets/upload', batch.map((f) => ({ key: f.hash, value: f.b64, metadata: { contentType: MIME[f.ext] || 'application/octet-stream' }, base64: true })))
    console.log(`uploaded ${batch.length} files`)
    batch = []
    size = 0
  }
  for (const f of todo) {
    if (size + f.b64.length > 40 * 1024 * 1024 || batch.length >= 1000) await flush()
    batch.push(f)
    size += f.b64.length
  }
  await flush()
  await api('/pages/assets/upsert-hashes', { hashes: files.map((f) => f.hash) })
  fs.writeFileSync(out, JSON.stringify(manifest))
  console.log(`${files.length} files in manifest, ${todo.length} uploaded`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
