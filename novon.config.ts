import { defineConfig } from 'novon/config'
import covers from './plugins/covers.ts'

export default defineConfig({
  title: "QinYang Wang 's Blog",
  description: '数字游民、公司注册与折腾日记。',
  url: 'https://qinyang.wang',
  lang: 'zh-CN',
  layout: 'blog',
  trailingSlash: false,
  rss: { path: '/feed', full: true },
  tags: { path: '/tag', lowercase: false },
  og: { enabled: true },
  // Old NotionNext paths. novon writes a forwarding page for each, so they redirect on hosts
  // without redirect rules (GitHub Pages) and in `_redirects` for the ones that read it.
  redirects: {
    '/page/2': '/',
    '/search': '/',
    '/tag/信用卡': '/',
    '/tag/科技': '/',
    '/tag/产品体验': '/',
  },
  nav: [
    { label: '博客', href: '/' },
    { label: '关于', href: '/about' },
    { label: '订阅', href: '/feed' },
  ],
  theme: {
    favicon: '/favicon.png',
    logo: '/brand/logo.png',
    social: {
      github: 'https://github.com/QinYangWang',
      x: 'https://twitter.com/EthanWQY',
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
  plugins: ['search', 'sitemap', 'rss', 'llms', covers],
})
