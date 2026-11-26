import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
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
    name: 'publish-catalog',
    async generateBundle() {
      const source = await readFile(new URL('./katalog.json', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'katalog.json', source });
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
