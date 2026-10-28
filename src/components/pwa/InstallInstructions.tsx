'use client'

import { useState, useSyncExternalStore } from 'react'
import { Copy } from 'lucide-react'
import { installGuide, isIosDevice, type InstallGuide } from '@/lib/pwa-client'

const subscribe = () => () => {}

/** На сервере user agent неизвестен: инструкция появляется после гидратации. */
export function useInstallGuide(): InstallGuide | null {
  return useSyncExternalStore(subscribe, () => installGuide(navigator.userAgent, isIosDevice()), () => null)
}

const ANDROID = <p><strong>Android:</strong> откройте меню браузера (⋮) и выберите «Установить приложение» или «Добавить на главный экран». Если такого пункта нет, откройте сайт в Chrome.</p>
const IPHONE = <p><strong>iPhone и iPad:</strong> откройте сайт в Safari, нажмите «Поделиться» → «На экран „Домой“», затем «Добавить». Открывайте MentorCareer с новой иконки.</p>

export function InstallInstructions({ guide }: { guide: InstallGuide }) {
  if (guide === 'in-app') return <InAppInstructions />
  if (guide === 'ios-safari') return <p>Нажмите «Поделиться» → «На экран „Домой“», затем «Добавить». Открывайте MentorCareer с новой иконки.</p>
  if (guide === 'ios-browser') return <p>Нажмите «Поделиться» → «На экран „Домой“». Если такого пункта нет, откройте сайт в Safari и добавьте его там.</p>
  if (guide === 'android') return ANDROID
  if (guide === 'android-yandex') return <YandexInstructions />
  return <>{ANDROID}{IPHONE}</>
}

function InAppInstructions() {
  return (
    <div className="space-y-3">
      <p>Сайт открыт внутри другого приложения - отсюда установка недоступна. Откройте его в Safari (iPhone) или Chrome (Android): в меню приложения, обычно «⋯», выберите «Открыть в браузере».</p>
      <CopyLink />
    </div>
  )
}

function YandexInstructions() {
  return (
    <div className="space-y-3">
      <p>В Яндекс Браузере MentorCareer можно добавить на экран только ярлыком: меню браузера → «Добавить ярлык». Такой ярлык открывает сайт обычной вкладкой.</p>
      <p>Чтобы MentorCareer открывался отдельным приложением, откройте сайт в Chrome и выберите в меню (⋮) «Установить приложение».</p>
      <CopyLink />
    </div>
  )
}

function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setState('copied')
    } catch (error) {
      // Встроенные браузеры часто не дают доступа к буферу — тогда ссылку копируют руками.
      console.error('Не удалось скопировать ссылку', error)
      setState('failed')
    }
  }

  return (
    <>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Copy className="h-4 w-4" aria-hidden="true" />Скопировать ссылку
      </button>
      <p role="status" className="text-xs">
        {state === 'copied' && 'Ссылка скопирована - вставьте её в адресную строку браузера.'}
        {state === 'failed' && <>Скопируйте ссылку вручную: <span className="select-all break-all font-medium">{window.location.href}</span></>}
      </p>
    </>
  )
}
