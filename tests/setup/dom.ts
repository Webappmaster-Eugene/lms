import { afterEach } from 'vitest'

await import('@testing-library/jest-dom/vitest')
const { cleanup } = await import('@testing-library/react')

afterEach(() => {
  cleanup()
})

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// Обёртка над атрибутом, а не полноценный DOMTokenList: тест должен видеть
// ровно ту строку разрешений, что окажется в разметке.
if (!Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'sandbox')?.get) {
  Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      const read = () => (this.getAttribute('sandbox') ?? '').split(/\s+/).filter(Boolean)
      const write = (tokens: string[]) => this.setAttribute('sandbox', tokens.join(' '))

      return {
        add: (...tokens: string[]) => write([...new Set([...read(), ...tokens])]),
        remove: (...tokens: string[]) => write(read().filter((t) => !tokens.includes(t))),
        contains: (token: string) => read().includes(token),
        get value() {
          return read().join(' ')
        },
      }
    },
  })
}
