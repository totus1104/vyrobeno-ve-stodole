import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { header, footer } from './src/layout.js';
import { czechTypography } from './src/typography.js';
import { shopApi } from './server/shop-api.js';

export default defineConfig({
  base: './',
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.shop-data/**'] } },
  plugins: [{
    name: 'shared-layout',
    transformIndexHtml(html, context) {
      const page = context.filename.replaceAll('\\', '/').split('/').pop();
      return czechTypography(html.replace('<!--site-header-->', header(page)).replace('<!--site-footer-->', footer()));
    },
  }, {
    name: 'shop-api',
    configureServer({ middlewares }) {
      middlewares.use(shopApi({ preview: true }));
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use(shopApi({ preview: true }));
    },
  }],
  build: {
    rollupOptions: {
      input: Object.fromEntries(['index', 'o-stodole', 'galerie', 'obchod', 'kontakt', 'kosik'].map(name => [name, fileURLToPath(new URL(`./${name}.html`, import.meta.url))])),
    },
  },
});
