import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { definePlugin } from 'novon/config'

/**
 * Header images are build output: `scripts/generate-covers.ts` renders `public/covers/<slug>.png`
 * before the build, and this hands that file to its post as the cover. A post that sets `cover:`
 * in its frontmatter keeps its own image, and a post without one falls back to novon's generated
 * cover art.
 */
export default definePlugin({
  name: 'covers',
  pageData(page, ctx) {
    if (page.cover !== undefined || page.kind !== 'page') return
    const slug = page.route.split('/').filter(Boolean).at(-1)
    if (!slug) return
    if (!existsSync(join(ctx.config.root, 'public/covers', `${slug}.png`))) return
    return { ...page, cover: `/covers/${slug}.png` }
  },
})
