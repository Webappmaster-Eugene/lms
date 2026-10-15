import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

import { SITE_URL } from './src/config.ts'

export default defineConfig({
  integrations: [],
  vite: {
    plugins: [tailwindcss()],
  },
  site: SITE_URL,
  // Одна страница: отдельный CSS-файл только задерживает первый экран лишним запросом.
  build: { inlineStylesheets: 'always' },
})
