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

function buildSrcdoc(encodedSource: string, timeLimitMs: number): string {
  const workerSource = `(function () {
  var send = self.postMessage.bind(self);
  function decode(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function fail(status, error) {
    send({
      status: status, tests: [], passedCount: 0, totalCount: 0, consoleOutput: [],
      error: (error && error.name ? error.name + ': ' : '') + (error && error.message ? error.message : String(error)), totalMs: 0
    });
  }
  var result;
  try {
    result = new Function(decode('${encodedSource}'))();
  } catch (error) {
    fail('compile_error', error);
    return;
  }
  Promise.resolve(result).then(send, function (error) { fail('error', error); });
})();`
  // В основном потоке фрейма работает только bootstrap. Цикл в решении
  // занимает поток Worker и не блокирует ни интерфейс, ни таймер отмены.
  const bootstrap = `(function () {
  var worker, timer, url, finished = false;
  function reply(payload) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (worker) worker.terminate();
    if (url) URL.revokeObjectURL(url);
    parent.postMessage({ type: 'trainer-result', payload: payload }, '*');
  }
  function fail(status, message) {
    reply({ status: status, tests: [], passedCount: 0, totalCount: 0, consoleOutput: [], error: message, totalMs: 0 });
  }
  function cleanup() {
    finished = true;
    clearTimeout(timer);
    if (worker) worker.terminate();
    if (url) URL.revokeObjectURL(url);
  }
  addEventListener('pagehide', cleanup);
  addEventListener('message', function (event) {
    if (event.source === parent && event.data && event.data.type === 'trainer-cancel') cleanup();
  });
  try {
    var binary = atob('${encodeSource(workerSource)}');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = function (event) { reply(event.data); };
    worker.onerror = function (event) { event.preventDefault(); fail('error', event.message || 'Не удалось выполнить код в Worker'); };
    timer = setTimeout(function () {
      fail('timeout', 'Превышен лимит времени (${timeLimitMs} мс). Похоже на бесконечный цикл.');
    }, ${timeLimitMs});
  } catch (error) {
    fail('error', error && error.message ? error.message : String(error));
  }
})();`

  const closeScript = `</${'script'}>`
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body><script>${bootstrap}${closeScript}</body></html>`
}

export function useCodeRunner(): CodeRunner {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null)
  const resolveRef = useRef<((result: TrainerRunResult) => void) | null>(null)

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
      iframeRef.current.contentWindow?.postMessage({ type: 'trainer-cancel' }, '*')
      iframeRef.current.remove()
      iframeRef.current = null
    }
    const resolve = resolveRef.current
    resolveRef.current = null
    resolve?.(failureResult('error', 'Выполнение отменено'))
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
        resolveRef.current = resolve
        const iframe = document.createElement('iframe')
        iframe.sandbox.add('allow-scripts')
        iframe.setAttribute('aria-hidden', 'true')
        iframe.style.display = 'none'
        iframeRef.current = iframe

        const settle = (result: TrainerRunResult) => {
          if (iframeRef.current !== iframe) return
          resolveRef.current = null
          cancel()
          resolve(result)
        }

        const onMessage = (event: MessageEvent) => {
          // Единственный надёжный признак отправителя: у sandbox без
          // allow-same-origin origin равен 'null', сравнивать его бессмысленно.
          if (event.source !== iframe.contentWindow) return
          const data = event.data as RunnerMessage
          if (data?.type !== 'trainer-result') return
          settle(normalizeRunResult(data.payload, { allowNoTests: spec.allowNoTests }))
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

        iframe.srcdoc = buildSrcdoc(encodeSource(composed.source), spec.timeLimitMs)
        document.body.appendChild(iframe)
      })
    },
    [cancel],
  )

  return { run, cancel }
}
