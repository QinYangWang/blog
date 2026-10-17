import { defineConfig } from 'novon/config'

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
  plugins: ['search', 'sitemap', 'rss', 'llms'],
})
