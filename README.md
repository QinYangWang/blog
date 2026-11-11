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
| `build.sh` | `novon build` with a novon checkout |
| `deploy.sh` | direct upload to the Cloudflare Pages project `qinyang-wang` |
| `.github/workflows/pages.yml` | calls novon's reusable workflow: build and publish to GitHub Pages |
| `.github/workflows/preview.yml` | builds a novon ref and screenshots the site, without deploying |

```bash
git clone https://github.com/QinYangWang/novon ../novon && (cd ../novon && bun install)
./build.sh                          # writes dist/
npx wrangler pages deploy dist --project-name qinyang-wang   # or ./deploy.sh inside Hark
```

## GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main` and publishes the site
to https://qinyangwang.github.io/blog/ through novon's reusable workflow. Turn
Pages on once under Settings → Pages → Source **GitHub Actions**.

The sub-path comes from the workflow (`base: /blog/`, `url: …`), which novon reads
as `NOVON_BASE` and `NOVON_URL`, so `novon.config.ts` keeps the custom domain and
the Cloudflare deploy is untouched. For a custom domain on Pages instead, swap
`base` for `cname`.

`public/_redirects` and `public/_headers` are Cloudflare only; Pages ignores them. The
old NotionNext paths (`/page/2`, `/search`, the retired tags) therefore live in
`redirects` in `novon.config.ts` as well: novon writes a forwarding page at each one,
so they redirect on Pages too. Only the `/page/*` splat needs a host that reads
`_redirects`.

## Preview

`preview.yml` builds the site against any novon branch and screenshots the pages, so a layout
change can be looked at before it ships. From the Actions tab, or:

```bash
gh workflow run preview -f novon-ref=<branch>
```

It uploads `shots/` (home, a post, a tag page, about, mobile width, dark mode) as a build
artifact and never deploys.
