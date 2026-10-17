# qinyang.wang

QinYang Wang 's Blog, built with [novon](https://github.com/QinYangWang/novon).
Migrated from NotionNext on 2026-10-17.

| Path | What |
| --- | --- |
| `novon.config.ts` | site config (blog layout) |
| `content/<slug>.mdx` | one file per post; the file name is the URL (`/<slug>`) |
| `public/images/<slug>/` | post images, downloaded from Notion |
| `public/_redirects` | old NotionNext paths: `/feed`, `/tag/*`, `/page/*`, `/search` |
| `scripts/migrate.py` | re-runnable Notion → MDX migration (`--refetch` to re-download) |
| `build.sh` | `novon build`, then flattens `x/index.html` to `x.html` so Pages serves `/x` without a trailing slash |
| `deploy.sh` | direct upload to the Cloudflare Pages project `qinyang-wang` |

```bash
git clone https://github.com/QinYangWang/novon ../novon && (cd ../novon && bun install)
./build.sh
npx wrangler pages deploy dist --project-name qinyang-wang   # or ./deploy.sh inside Hark
```
