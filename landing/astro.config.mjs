import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

import { SITE_URL } from './src/config.ts'

export default defineConfig({
  integrations: [],
  vite: {
    plugins: [tailwindcss()],
    // Маленький скрипт Astro встроил бы в HTML, а CSP (script-src 'self') встроенные не исполняет.
    build: { assetsInlineLimit: 0 },
  },
  site: SITE_URL,
  // Одна страница: отдельный CSS-файл только задерживает первый экран лишним запросом.
  build: { inlineStylesheets: 'always' },
  // Astro 7 по умолчанию сжимает HTML иначе ('jsx'): держим прежнее поведение, чтобы не поехали пробелы в тексте.
  compressHTML: true,
})
