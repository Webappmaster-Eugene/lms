'use client'

import { useRef, useCallback } from 'react'

type ExecutionResult = {
  output: string
  error: string | null
  timedOut: boolean
}

const EXECUTION_TIMEOUT_MS = 5000
const MAX_OUTPUT_LENGTH = 10240 // 10KB

/**
 * Безопасный запуск JavaScript кода в изолированном iframe sandbox.
 *
 * Безопасность:
 * - sandbox="allow-scripts" без allow-same-origin
 * - Нет доступа к cookies, localStorage, API платформы
 * - Таймаут 5 секунд
 * - Ограничение output до 10KB
 */
export function useCodeRunner() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (iframeRef.current) {
      iframeRef.current.remove()
      iframeRef.current = null
    }
  }, [])

  const execute = useCallback((code: string): Promise<ExecutionResult> => {
    return new Promise((resolve) => {
      cleanup()

      const iframe = document.createElement('iframe')
      iframe.sandbox.add('allow-scripts')
      iframe.style.display = 'none'
      iframeRef.current = iframe

      const onMessage = (event: MessageEvent) => {
        // Принимаем сообщения только от sandbox iframe
        if (event.source !== iframe.contentWindow) return

        const data = event.data
        if (data?.type === 'execution-result') {
          window.removeEventListener('message', onMessage)
          cleanup()

          const output = typeof data.output === 'string'
            ? data.output.slice(0, MAX_OUTPUT_LENGTH)
            : ''

          resolve({
            output,
            error: data.error ?? null,
            timedOut: false,
          })
        }
      }

      window.addEventListener('message', onMessage)

      // Таймаут
      timeoutRef.current = setTimeout(() => {
        window.removeEventListener('message', onMessage)
        cleanup()
        resolve({
          output: '',
          error: 'Превышено время выполнения (5 секунд). Возможно, в коде бесконечный цикл.',
          timedOut: true,
        })
      }, EXECUTION_TIMEOUT_MS)

      // Формируем srcdoc с безопасным окружением
      // Encode user code as base64 to avoid any HTML/JS escaping issues
      const base64Code = btoa(unescape(encodeURIComponent(code)))

      // Use base64 encoding to completely avoid script injection in srcdoc.
      // The code is decoded and executed via new Function() inside the sandbox.
      iframe.srcdoc = `<!DOCTYPE html><html><body><script>
(function() {
  var _output = [];
  var _maxLines = 200;

  function _capture() {
    var args = Array.prototype.slice.call(arguments);
    if (_output.length < _maxLines) {
      _output.push(args.map(function(a) {
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch(e) { return String(a); }
        }
        return String(a);
      }).join(' '));
    }
  }

  console.log = _capture;
  console.warn = _capture;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    _capture.apply(null, ['[ERROR] '].concat(args));
  };
  console.info = _capture;

  window.alert = function() {};
  window.prompt = function() { return null; };
  window.confirm = function() { return false; };

  try {
    var _code = decodeURIComponent(escape(atob('${base64Code}')));
    (new Function(_code))();
    parent.postMessage({ type: 'execution-result', output: _output.join('\\n'), error: null }, '*');
  } catch(e) {
    parent.postMessage({ type: 'execution-result', output: _output.join('\\n'), error: e.message || String(e) }, '*');
  }
})();
<\/script></body></html>`

      document.body.appendChild(iframe)
    })
  }, [cleanup])

  return { execute, cleanup }
}
