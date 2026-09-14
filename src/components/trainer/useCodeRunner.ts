'use client'

import { useCallback, useEffect, useRef } from 'react'

import { composeScript } from '@/lib/trainer/compose'
import { failureResult, normalizeRunResult } from '@/lib/trainer/result'
import type { TrainerExecSpec, TrainerRunResult } from '@/lib/trainer/types'

/**
 * Прогон решения в браузере — мгновенная обратная связь по кнопке «Запустить».
 *
 * Изоляция браузерная и настоящая: iframe с sandbox="allow-scripts" БЕЗ
 * allow-same-origin, то есть уникальный непрозрачный origin. Оттуда не видно ни
 * cookies, ни localStorage, ни API платформы.
 *
 * Этот результат — только для показа. Баллы начисляются исключительно по
 * вердикту /api/trainer/submit, который гоняет те же тесты в V8-изоляте на
 * сервере из своей копии задачи.
 */

/** Запас поверх лимита задачи: iframe должен успеть стартовать и ответить. */
const HOST_TIMEOUT_OVERHEAD_MS = 1500

type RunnerMessage = {
  type?: unknown
  payload?: unknown
}

export type CodeRunner = {
  run: (spec: TrainerExecSpec) => Promise<TrainerRunResult>
  cancel: () => void
}

/** Кодирует исходник в base64: в srcdoc нельзя просто так вставить `</script>`. */
function encodeSource(source: string): string {
  const bytes = new TextEncoder().encode(source)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function buildSrcdoc(encodedSource: string): string {
  // Скрипт декодирует исходник и исполняет его как тело функции. Сам исходник
  // в разметку не попадает — только base64, поэтому экранировать нечего.
  const bootstrap = `(function () {
  function decode(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function reply(payload) {
    parent.postMessage({ type: 'trainer-result', payload: payload }, '*');
  }
  var source = decode('${encodedSource}');
  var result;
  try {
    result = new Function(source)();
  } catch (error) {
    reply({
      status: 'compile_error',
      tests: [],
      passedCount: 0,
      totalCount: 0,
      consoleOutput: [],
      error: (error && error.name ? error.name + ': ' : '') + (error && error.message ? error.message : String(error)),
      totalMs: 0
    });
    return;
  }
  Promise.resolve(result).then(reply, function (error) {
    reply({
      status: 'error',
      tests: [],
      passedCount: 0,
      totalCount: 0,
      consoleOutput: [],
      error: error && error.message ? error.message : String(error),
      totalMs: 0
    });
  });
})();`

  // Закрывающий тег собирается конкатенацией: иначе он закрыл бы <script> в том
  // документе, в который бандлер может встроить этот модуль.
  const closeScript = `</${'script'}>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>${bootstrap}${closeScript}</body></html>`
}

export function useCodeRunner(): CodeRunner {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (listenerRef.current) {
      window.removeEventListener('message', listenerRef.current)
      listenerRef.current = null
    }
    if (iframeRef.current) {
      // Синхронный бесконечный цикл таймером не прервать: единственный способ
      // остановить фрейм — выбросить его из документа.
      iframeRef.current.remove()
      iframeRef.current = null
    }
  }, [])

  useEffect(() => cancel, [cancel])

  const run = useCallback(
    (spec: TrainerExecSpec): Promise<TrainerRunResult> => {
      cancel()

      let composed
      try {
        composed = composeScript(spec)
      } catch (error) {
        return Promise.resolve(
          failureResult(
            'error',
            error instanceof Error ? error.message : 'Не удалось собрать скрипт проверки',
          ),
        )
      }

      return new Promise<TrainerRunResult>((resolve) => {
        const iframe = document.createElement('iframe')
        iframe.sandbox.add('allow-scripts')
        iframe.setAttribute('aria-hidden', 'true')
        iframe.style.display = 'none'
        iframeRef.current = iframe

        const settle = (result: TrainerRunResult) => {
          cancel()
          resolve(result)
        }

        const onMessage = (event: MessageEvent) => {
          // Единственный надёжный признак отправителя: у sandbox без
          // allow-same-origin origin равен 'null', сравнивать его бессмысленно.
          if (event.source !== iframe.contentWindow) return
          const data = event.data as RunnerMessage
          if (data?.type !== 'trainer-result') return
          settle(normalizeRunResult(data.payload))
        }

        listenerRef.current = onMessage
        window.addEventListener('message', onMessage)

        timerRef.current = setTimeout(() => {
          settle(
            failureResult(
              'timeout',
              `Превышен лимит времени (${spec.timeLimitMs} мс). Похоже на бесконечный цикл.`,
            ),
          )
        }, spec.timeLimitMs + HOST_TIMEOUT_OVERHEAD_MS)

        iframe.srcdoc = buildSrcdoc(encodeSource(composed.source))
        document.body.appendChild(iframe)
      })
    },
    [cancel],
  )

  return { run, cancel }
}
