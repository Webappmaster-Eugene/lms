import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

/**
 * Tailwind подключается Vite-плагином, а не интеграцией @astrojs/tailwind:
 * интеграция объявлена устаревшей и поддерживала только Tailwind 3.
 * Тема живёт не в JS-конфиге, а в CSS — см. блок @theme в src/styles/global.css.
 */
export default defineConfig({
  integrations: [],
  vite: {
    plugins: [tailwindcss()],
  },
  site: 'https://promo.nadtocheev.ru',
})
