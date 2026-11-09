#!/usr/bin/env bun
/**
 * Header images ("头图") for posts: one 21:9 PNG per post with the post title set into the
 * seeded mesh gradient novon draws for cover art, so a post opens on a title card instead of
 * bare abstract art.
 *
 *   bun scripts/generate-covers.ts           # render what changed
 *   bun scripts/generate-covers.ts --force   # re-render everything
 *   bun scripts/generate-covers.ts --dry     # report only, write nothing
 *
 * Output `public/covers/<slug>.png`, which `plugins/covers.ts` hands to the post as its cover,
 * so the images are build output and stay out of git. Text stays inside the middle 70% of the
 * canvas, so the crops the site makes still show the whole title: the featured card cuts ~14% of
 * the sides, 16:9 boxes on phones ~12%, the 21:9 post header none.
 *
 * novon is used as a checkout (see README): `NOVON=../novon bun scripts/generate-covers.ts`.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dir, '..')
const NOVON = resolve(ROOT, process.env.NOVON ?? '../novon')
const OUT_DIR = join(ROOT, 'public/covers')
const CACHE_DIR = join(ROOT, '.novon/covers')
const WIDTH = 1600
const HEIGHT = 686 // ~21:9: the aspect the post page and the post cards show
const PAD_X = 240 // keeps the title clear of the 14% the narrowest crop takes off each side
const PAD_Y = 72
const INNER = WIDTH - PAD_X * 2

const force = process.argv.includes('--force')
const dry = process.argv.includes('--dry')

type Style = Record<string, string | number>

/* novon installed the renderer packages; the site itself has no node_modules. */
const fromNovon = <T>(id: string): Promise<T> => import(pathToFileURL(Bun.resolveSync(id, NOVON)).href) as Promise<T>
const fromNovonFile = (rel: string): Promise<any> => import(pathToFileURL(join(NOVON, rel)).href)

const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u

/** Width in em: CJK and full-width characters count double. */
const emWidth = (text: string) => [...text].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0)

/** Type size for a title: as large as its measured width allows on two lines. */
function titleSize(title: string): number {
  const em = emWidth(title)
  const base = em <= 22 ? 104 : em <= 30 ? 92 : em <= 38 ? 80 : 68
  return Math.max(48, Math.min(base, Math.floor((INNER * 2) / em)))
}

const hash = (...parts: string[]) => {
  const h = createHash('sha256')
  for (const p of parts) h.update(p)
  return h.digest('hex').slice(0, 12)
}

function webFamily(lang: string): string {
  const l = lang.toLowerCase()
  if (l.startsWith('ja')) return 'Noto Sans JP'
  if (l.startsWith('ko')) return 'Noto Sans KR'
  if (l === 'zh-tw' || l === 'zh-hk' || l.startsWith('zh-hant')) return 'Noto Sans TC'
  return 'Noto Sans SC'
}

/* ---------- fonts ---------- */

/** A non-browser user agent gets TrueType rather than WOFF2, which the renderer cannot read. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': 'novon' } })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.text()
}

/** A subset of a web font holding only `text`, cached on disk: no 10 MB CJK download per cover. */
async function subsetFont(family: string, weight: 400 | 700, text: string): Promise<ArrayBuffer> {
  const chars = [...new Set(text)].sort().join('')
  const file = join(CACHE_DIR, 'fonts', `${hash(family, String(weight), chars)}.ttf`)
  if (existsSync(file)) {
    const data = await readFile(file)
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  }
  const css = await fetchText(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(chars)}`,
  )
  const url = /src:\s*url\(([^)]+)\)\s*format\('(truetype|opentype|woff)'\)/.exec(css)?.[1]
  if (!url) throw new Error(`no TTF in the font response for ${family} ${weight}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`font download failed: ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, data)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

/* ---------- the card ---------- */

type CoverProps = {
  title: string
  site: string
  date?: string
  author?: string
  tags: string[]
  palette: string[]
  seed: string
  background: string
  meshGradient: (colors: string[], seed: string) => string
}

/** Mesh gradient, a wash that keeps white type readable, then site name, tags, title and meta. */
function cover({ title, site, date, author, tags, palette, seed, background, meshGradient }: CoverProps, h: (...args: any[]) => any) {
  const size = titleSize(title)
  const meta = [date, author].filter(Boolean).join(' · ')
  const slack = Math.ceil(size * 0.14) // CJK fonts draw taller than the line box
  /* Two scrims: a flat one that holds any palette dark enough for white type, and a gradient
     that anchors the title at the bottom and the site name at the top. */
  const scrim: Style = { position: 'absolute', left: 0, top: 0, width: WIDTH, height: HEIGHT, display: 'flex', backgroundColor: 'rgba(0,0,0,0.42)' }
  const shade: Style = {
    ...scrim,
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 40%, rgba(0,0,0,0.10) 75%, rgba(0,0,0,0.20) 100%)',
  }
  const chip: Style = {
    display: 'flex',
    alignItems: 'center',
    height: 40,
    padding: '0 16px',
    borderRadius: 20,
    fontSize: 22,
    lineHeight: 1,
    color: 'rgba(255,255,255,0.92)',
    backgroundColor: 'rgba(255,255,255,0.16)',
    border: '1px solid rgba(255,255,255,0.22)',
  }
  return h(
    'div',
    {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        padding: `${PAD_Y}px ${PAD_X}px`,
        boxSizing: 'border-box',
        backgroundColor: background,
        backgroundImage: meshGradient(palette, seed),
      } as Style,
    },
    h('div', { style: scrim }),
    h('div', { style: shade }),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, height: 44, width: '100%', position: 'relative' } as Style },
      h('div', { style: { display: 'flex', fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.4, color: 'rgba(255,255,255,0.95)' } as Style }, site),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } as Style }, ...tags.slice(0, 3).map((tag) => h('div', { style: chip }, `#${tag}`))),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 18, width: INNER, position: 'relative' } as Style },
      h(
        'div',
        {
          style: {
            display: 'block',
            width: INNER,
            fontSize: size,
            fontWeight: 700,
            lineHeight: 1.16,
            letterSpacing: size >= 74 ? -2 : -1,
            color: '#ffffff',
            lineClamp: 3,
            overflow: 'hidden',
            paddingBottom: slack,
            marginBottom: -slack,
          } as Style,
        },
        title,
      ),
      ...(meta ? [h('div', { style: { display: 'flex', fontSize: 26, lineHeight: 1.2, letterSpacing: 0.2, color: 'rgba(255,255,255,0.82)' } as Style }, meta)] : []),
    ),
  )
}

/* ---------- cache ---------- */

/** The signature recorded for a cover in the cache, or '' when there is none. */
async function signatureOf(stamp: string): Promise<string> {
  try {
    return JSON.parse(await readFile(stamp, 'utf8')).signature ?? ''
  } catch {
    return ''
  }
}

/* ---------- run ---------- */

const { loadConfig } = await fromNovonFile('src/node/load-config.ts')
const { scanContent } = await fromNovonFile('src/node/content.ts')
const { seedPalette, meshGradient } = await fromNovonFile('src/lib/seed-palette.ts')
const { formatDate } = await fromNovonFile('src/shared.ts')
const { createElement } = await fromNovon<typeof import('react')>('react')
const { default: satori } = await fromNovon<typeof import('satori')>('satori')
const { Resvg } = await fromNovon<typeof import('@resvg/resvg-js')>('@resvg/resvg-js')

const config = await loadConfig(ROOT)
const pages = await scanContent(config)
const posts = pages.filter((p: any) => p.kind === 'page' && p.date && p.cover !== false && !p.hidden)
if (!posts.length) throw new Error(`no posts in ${join(ROOT, 'content')}`)

const family = webFamily(config.lang)
const queue = [...posts]
let rendered = 0
let kept = 0
let size = ''

const worker = async () => {
  for (let page = queue.shift(); page; page = queue.shift()) {
    const slug = page.route.split('/').filter(Boolean).at(-1) ?? 'index'
    const png = join(OUT_DIR, `${slug}.png`)
    const stamp = join(CACHE_DIR, `${slug}.json`)
    const date = formatDate(page.date, config.lang)
    const author = page.author === undefined ? undefined : page.author
    const tags: string[] = page.tags.filter(Boolean)
    const palette = seedPalette(slug)
    const signature = hash(slug, page.title, date, author ?? '', tags.join(','), palette.join(','), config.title)

    if (force || !existsSync(png) || (await signatureOf(stamp)) !== signature) {
      const text = [page.title, config.title, date, author ?? '', ...tags.map((t) => `#${t}`), ' ·0123456789'].filter(Boolean).join('')
      const fonts = await Promise.all(
        ([400, 700] as const).map(async (weight) => ({ name: 'cover', data: await subsetFont(family, weight, text), weight, style: 'normal' as const })),
      )
      const element = cover({ title: page.title, site: config.title, date, author, tags, palette, seed: slug, background: palette[0], meshGradient }, createElement)
      const svg = await satori(element, { width: WIDTH, height: HEIGHT, fonts })
      const image = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render()
      if (!dry) {
        await mkdir(OUT_DIR, { recursive: true })
        await writeFile(png, image.asPng())
        await mkdir(CACHE_DIR, { recursive: true })
        await writeFile(stamp, JSON.stringify({ signature }))
      }
      size = `${image.width}×${image.height}`
      rendered++
    } else kept++
  }
}

await Promise.all([worker(), worker(), worker()])
console.log(`${dry ? 'would render' : 'covers'}: ${rendered} rendered, ${kept} unchanged, ${posts.length} posts${size ? ` · ${size}` : ''}`)
