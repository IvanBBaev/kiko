import { withMermaid } from 'vitepress-plugin-mermaid';

const repo = 'https://github.com/IvanBBaev/kiko';

// VitePress documentation site for kiko. Source pages are the existing Markdown
// files in docs/; this config only wires nav, sidebar, search and the GitHub
// Pages base path (the site is served at https://ivanbbaev.github.io/kiko/).
export default withMermaid({
  lang: 'en-US',
  title: 'kiko',
  description: 'AI news aggregation backend — RSS to Claude synthesis to site & LinkedIn posts.',
  // Project Pages live under /<repo>/ — this prefixes every asset and link.
  base: '/kiko/',
  cleanUrls: true,
  lastUpdated: true,
  // The in-repo docs link up and out of the docs root (../src/..., ../TODO.md),
  // which are not pages on this site. Ignore any link that escapes upward; real
  // in-site dead links still fail the build.
  ignoreDeadLinks: [/\.\.\//],
  head: [['meta', { name: 'theme-color', content: '#5FA04E' }]],
  themeConfig: {
    nav: [
      { text: 'Overview', link: '/' },
      { text: 'Architecture', link: '/ARCHITECTURE' },
      { text: 'Product state', link: '/PRODUCT_STATE' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [{ text: 'Overview', link: '/' }],
      },
      {
        text: 'Design',
        items: [
          { text: 'Architecture', link: '/ARCHITECTURE' },
          { text: 'Database analysis', link: '/db-analysis' },
          { text: 'Best practices research', link: '/best-practices' },
        ],
      },
      {
        text: 'Status',
        items: [{ text: 'Product state', link: '/PRODUCT_STATE' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    search: { provider: 'local' },
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Ivan Baev',
    },
  },
});
