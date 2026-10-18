import { describe, expect, it } from 'vitest'
import { installGuide } from '@/lib/pwa-client'

/**
 * Ученик не может установить приложение, если ищет пункт меню, которого в его браузере нет.
 * Инструкция подбирается по реальным user agent: встроенные браузеры мессенджеров установку
 * не поддерживают вовсе, на iPhone «На экран „Домой“» надёжно есть только в Safari.
 */
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneYandex: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 YaBrowser/24.10.5.392 Mobile/15E148 Safari/604.1',
  iphoneWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidYandex: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.2.105 Mobile Safari/537.36',
  androidTelegram: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Telegram-Android/11.2.3',
  androidVk: 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36 VKAndroidApp/8.95-15432',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

describe('инструкция по установке', () => {
  it.each([
    ['iphoneSafari', true, 'ios-safari'],
    ['iphoneChrome', true, 'ios-browser'],
    ['iphoneYandex', true, 'ios-browser'],
    ['iphoneWebView', true, 'in-app'],
    ['iphoneInstagram', true, 'in-app'],
    ['androidChrome', false, 'android'],
    ['androidYandex', false, 'android'],
    ['androidTelegram', false, 'in-app'],
    ['androidVk', false, 'in-app'],
    ['desktopChrome', false, 'desktop'],
  ] as const)('%s (iOS: %s) → %s', (name, ios, guide) => {
    expect(installGuide(UA[name], ios)).toBe(guide)
  })
})
