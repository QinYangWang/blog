import { defineConfig } from 'novon/config'

export default defineConfig({
  title: "QinYang Wang 's Blog",
  description: '数字游民、公司注册与折腾日记。',
  url: 'https://qinyang.wang',
  lang: 'zh-CN',
  layout: 'blog',
  trailingSlash: false,
  // `.xml` on purpose: GitHub Pages sets the media type from the extension, so an
  // extension-less `/feed` would be served as a download.
  rss: { path: '/feed.xml', full: true },
  tags: { path: '/tag', lowercase: false },
  og: { enabled: true },
  // 寒蝉全圆体 for every page: the stylesheet declares the face, novon puts it on every font role.
  font: {
    css: 'https://cn-font.claude-code-best.win/packages/hcqyt/dist/ChillRoundFRegular/result.css',
    family: '寒蝉全圆体',
  },
  // Old NotionNext paths. novon writes a forwarding page for each, so they redirect on hosts
  // without redirect rules (GitHub Pages) and in `_redirects` for the ones that read it.
  redirects: {
    '/page/2': '/',
    '/search': '/',
    '/tag/信用卡': '/',
    '/tag/科技': '/',
    '/tag/产品体验': '/',
    // The feed used to live at /feed; keep the old link working where a host cannot 301 it.
    '/feed': '/feed.xml',
  },
  nav: [
    { label: '博客', href: '/' },
    { label: '关于', href: '/about' },
    { label: '订阅', href: '/feed.xml' },
  ],
  theme: {
    favicon: '/favicon.png',
    logo: '/brand/logo.png',
    social: {
      github: 'https://github.com/QinYangWang',
      x: 'https://x.com/oukinyou',
      rss: true,
    },
    authors: {
      'QinYang Wang': {
        bio: 'DevOps based in China. Serverless, CloudNative, iOS, DevOps, BuildInPublic.',
        avatar: '/brand/avatar.png',
      },
    },
    footer: { text: "© 2024–2026 QinYang Wang 's Blog" },
  },
  plugins: ['search', 'sitemap', 'rss', 'llms'],
})
