/**
 * Сообщает поисковикам по протоколу IndexNow (Яндекс, Bing и другие участники), что страницы
 * лендинга info.mentorcareer.ru изменились: запускать после выката, когда новая версия уже на проде.
 * Адреса берутся из карты сайта прода, ключ - публичный файл landing/public/<ключ>.txt.
 *
 * node scripts/landing-indexnow.mjs [--dry-run]
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'

const SITE = 'https://info.mentorcareer.ru'
const dryRun = process.argv.includes('--dry-run')
const keyFile = readdirSync(path.resolve(import.meta.dirname, '../landing/public')).find((name) => /^[0-9a-f]{32}\.txt$/.test(name))
if (!keyFile) throw new Error('Нет файла ключа IndexNow в landing/public')
const key = keyFile.slice(0, -4)

const published = await fetch(`${SITE}/${keyFile}`)
if (!published.ok || (await published.text()).trim() !== key) throw new Error(`Ключ ${SITE}/${keyFile} на проде не отвечает: сначала выкатите лендинг`)

const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text()
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
if (urlList.length === 0) throw new Error('В карте сайта нет адресов')
console.log(`Адресов в карте сайта: ${urlList.length}`)
if (dryRun) {
  console.log(urlList.join('\n'))
  process.exit(0)
}

// Яндекс сам передаёт уведомление остальным участникам IndexNow, отдельный запрос - для Bing.
for (const endpoint of ['https://yandex.com/indexnow', 'https://www.bing.com/indexnow']) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList }),
  })
  console.log(`${endpoint}: ${response.status} ${response.statusText}`)
  if (!response.ok && response.status !== 202) process.exitCode = 1
}
