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
| `scripts/generate-covers.ts` | renders the post header images into `public/covers/` (build output, not in git) |
| `plugins/covers.ts` | hands `public/covers/<slug>.png` to its post as `cover` |
| `build.sh` | generates the header images, then runs `novon build` |
| `deploy.sh` | direct upload to the Cloudflare Pages project `qinyang-wang` |
| `.github/workflows/pages.yml` | calls novon's reusable workflow: build and publish to GitHub Pages |

```bash
git clone https://github.com/QinYangWang/novon ../novon && (cd ../novon && bun install)
./build.sh                          # writes public/covers/ and dist/
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

## Header images

Every post gets a 1600×686 title card: the mesh gradient novon seeds from the slug, with the
title, date, author and tags drawn on it. `build.sh` renders them into `public/covers/<slug>.png`
first, and `plugins/covers.ts` gives each post the file with its slug as `cover`, so a post needs
no frontmatter for it and adding a post is enough to get a card.

- It re-renders only what changed (title, date, author, tags, palette): `--force` redoes all,
  `--dry` reports without writing.
- The images are build output: `public/covers/` is in `.gitignore`, so the repo stays small and
  a build always matches the post titles. `cover:` in frontmatter still wins when a post has a
  picture of its own.
- Type is kept inside the middle 72% of the canvas, because 16:9 boxes on phones and the
  featured card crop about 12–14% off each side.
- Fonts are Noto Sans SC subsets fetched per card and cached in `.novon/covers/fonts/`, so the
  repo carries no CJK font. `NOVON=<path> bun scripts/generate-covers.ts` points at another
  novon checkout.
