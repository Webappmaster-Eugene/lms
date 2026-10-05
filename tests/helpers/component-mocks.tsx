import { vi } from 'vitest'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

/**
 * Заглушки внешних пакетов для компонентных тестов.
 *
 * Фабрики, а не готовые моки: `vi.mock` поднимается наверх файла и не видит
 * импортов, поэтому в тесте пишется
 * `vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())`.
 */

/** Узлы последнего рендера ReactFlow — из них заглушка useReactFlow().getNode отвечает. */
const renderedFlowNodes: { current: { id: string; position?: { x: number; y: number } }[] } = { current: [] }

/** Центрирование карты: проверяется, что поиск и «К моему шагу» ведут к нужной теме. */
export const flowSetCenter = vi.fn(async () => true)

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
      onNodeClick,
      children,
    }: {
      nodes?: { id: string; type?: string; data?: unknown; position?: { x: number; y: number } }[]
      nodeTypes?: Record<string, (props: { data: unknown }) => ReactNode>
      onNodeClick?: (event: unknown, node: unknown) => void
      children?: ReactNode
    }) => {
      renderedFlowNodes.current = nodes
      return (
        <div data-testid="react-flow" data-node-count={nodes.length}>
          {nodes.map((node) => {
            const NodeComponent = node.type ? nodeTypes[node.type] : undefined
            return (
              <div
                key={node.id}
                data-testid="flow-node"
                data-node-type={node.type}
                onClick={(event) => onNodeClick?.(event, node)}
              >
                {NodeComponent ? <NodeComponent data={node.data} /> : null}
              </div>
            )
          })}
          {children}
        </div>
      )
    },
    Background: () => <div data-testid="flow-background" />,
    Controls: () => <div data-testid="flow-controls" />,
    MiniMap: () => <div data-testid="flow-minimap" />,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
    ConnectionLineType: { SmoothStep: 'smoothstep', Bezier: 'default', Straight: 'straight' },
    Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    useReactFlow: () => ({
      fitView: vi.fn(),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: vi.fn(async () => true),
      screenToFlowPosition: (p: unknown) => p,
      getNode: (id: string) => renderedFlowNodes.current.find((n) => n.id === id),
      setCenter: flowSetCenter,
    }),
    useStore: (selector: (state: { nodeLookup: Map<string, { measured?: { width: number; height: number } }> }) => unknown) => selector({ nodeLookup: new Map(renderedFlowNodes.current.map((node) => [node.id, { measured: { width: 280, height: 200 } }])) }),
    BaseEdge: () => <path />,
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
/** Команды, которые редактор зарегистрировал через addCommand: ключ — сочетание клавиш. */
export const monacoCommands = new Map<number, () => void>()

/** Коды клавиш Monaco, которыми пользуется редактор тренажёра. */
export const MONACO_KEYS = { CtrlCmd: 2048, Shift: 1024, Enter: 3 } as const

export function monacoMock() {
  const fakeMonaco = {
    KeyMod: { CtrlCmd: MONACO_KEYS.CtrlCmd, Shift: MONACO_KEYS.Shift },
    KeyCode: { Enter: MONACO_KEYS.Enter },
  }
  const fakeInstance = {
    addCommand: (keybinding: number, handler: () => void) => monacoCommands.set(keybinding, handler),
    createDecorationsCollection: () => ({ set: () => {} }),
    getModel: () => null,
  }

  function MonacoStub({
    value,
    onChange,
    language,
    onMount,
  }: {
    value?: string
    onChange?: (value: string | undefined) => void
    language?: string
    onMount?: (instance: unknown, monaco: unknown) => void
  }) {
    useEffect(() => {
      onMount?.(fakeInstance, fakeMonaco)
      // Monaco вызывает onMount один раз — как и заглушка.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
      <textarea
        data-testid="monaco"
        data-language={language}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
      />
    )
  }

  return {
    default: MonacoStub,
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
