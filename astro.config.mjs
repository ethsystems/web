import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://iptf.ethereum.org',
  integrations: [
    react(),
    sitemap(),
  ],
  build: {
    assets: 'astro',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
