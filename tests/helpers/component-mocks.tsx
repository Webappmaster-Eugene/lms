import { vi } from 'vitest'
import { useCallback, useState, type ReactNode } from 'react'

/**
 * Заглушки внешних пакетов для компонентных тестов.
 *
 * Фабрики, а не готовые моки: `vi.mock` поднимается наверх файла и не видит
 * импортов, поэтому в тесте пишется
 * `vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())`.
 */

/** Из @xyflow/react компоненты берут только Handle и Position. */
export function xyflowMock() {
  return {
    Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
    Handle: ({ type, position }: { type: string; position: string }) => (
      <div data-testid="handle" data-handle-type={type} data-handle-position={position} />
    ),
    ReactFlowProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    // Канва не рисуется: узлы из nodeTypes выводятся напрямую, чтобы тест
    // проверял состав графа, а не вёрстку библиотеки.
    ReactFlow: ({
      nodes = [],
      nodeTypes = {},
      children,
    }: {
      nodes?: { id: string; type?: string; data?: unknown }[]
      nodeTypes?: Record<string, (props: { data: unknown }) => ReactNode>
      children?: ReactNode
    }) => (
      <div data-testid="react-flow" data-node-count={nodes.length}>
        {nodes.map((node) => {
          const NodeComponent = node.type ? nodeTypes[node.type] : undefined
          return (
            <div key={node.id} data-testid="flow-node" data-node-type={node.type}>
              {NodeComponent ? <NodeComponent data={node.data} /> : null}
            </div>
          )
        })}
        {children}
      </div>
    ),
    Background: () => <div data-testid="flow-background" />,
    Controls: () => <div data-testid="flow-controls" />,
    MiniMap: () => <div data-testid="flow-minimap" />,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
    ConnectionLineType: { SmoothStep: 'smoothstep', Bezier: 'default', Straight: 'straight' },
    Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    useReactFlow: () => ({ fitView: vi.fn(), screenToFlowPosition: (p: unknown) => p }),
    // Состояние графа реализовано по-настоящему: редактор роадмапа строит на
    // нём всю логику, и заглушка-пустышка сделала бы его тесты бессмысленными.
    useNodesState: useElementsState,
    useEdgesState: useElementsState,
    applyNodeChanges,
    applyEdgeChanges: applyNodeChanges,
    addEdge: (edge: FlowElement, edges: FlowElement[]) =>
      edges.some((e) => e.id === edge.id) ? edges : [...edges, edge],
  }
}

type FlowElement = { id: string; position?: { x: number; y: number }; selected?: boolean }

type ElementChange =
  | { type: 'remove'; id: string }
  | { type: 'position'; id: string; position?: { x: number; y: number } }
  | { type: 'select'; id: string; selected: boolean }
  | { type: string; id?: string }

function applyNodeChanges<T extends FlowElement>(changes: ElementChange[], elements: T[]): T[] {
  let result = elements

  for (const change of changes) {
    if (change.type === 'remove') {
      result = result.filter((element) => element.id !== change.id)
      continue
    }
    if (change.type === 'position' && 'position' in change && change.position) {
      const position = change.position
      result = result.map((element) =>
        element.id === change.id ? { ...element, position } : element,
      )
      continue
    }
    if (change.type === 'select' && 'selected' in change) {
      result = result.map((element) =>
        element.id === change.id ? { ...element, selected: change.selected } : element,
      )
    }
  }

  return result
}

function useElementsState<T extends FlowElement>(initial: T[] = []) {
  const [elements, setElements] = useState<T[]>(initial)
  const onChange = useCallback(
    (changes: ElementChange[]) => setElements((current) => applyNodeChanges(changes, current)),
    [],
  )
  return [elements, setElements, onChange] as const
}

/** Роутер Next. push/replace/refresh возвращаются наружу для проверок. */
export function navigationMock(overrides: Record<string, unknown> = {}) {
  const push = vi.fn()
  const replace = vi.fn()
  const refresh = vi.fn()
  const back = vi.fn()

  return {
    push,
    replace,
    refresh,
    back,
    useRouter: () => ({ push, replace, refresh, back, prefetch: vi.fn(), forward: vi.fn() }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    ...overrides,
  }
}

/** next/link — обычная ссылка, чтобы работали getByRole('link'). */
export function linkMock() {
  return {
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  }
}

/** Редактор кода: textarea вместо Monaco — событий и значения достаточно. */
export function monacoMock() {
  return {
    default: ({
      value,
      onChange,
      language,
    }: {
      value?: string
      onChange?: (value: string | undefined) => void
      language?: string
    }) => (
      <textarea
        data-testid="monaco"
        data-language={language}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
      />
    ),
    loader: { config: vi.fn() },
    useMonaco: () => null,
  }
}

/** Markdown без shiki: подсветка в тестах не нужна и заметно тормозит. */
export function markdownMock() {
  return {
    default: ({ children }: { children?: ReactNode }) => (
      <div data-testid="markdown">{children}</div>
    ),
  }
}
