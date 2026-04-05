/**
 * Палитра Miro-стиля для узлов роадмапа.
 *
 * На доске Eugene Galera каждая стадия обучения имеет свою цветовую семантику:
 * - `base` (1 неделя базы) — жёлтый (HTML/CSS/JS)
 * - `stage1` (Стажёр 2-4 нед) — салатовый (ключевые технологии: React, NestJS, TS)
 * - `stage2` (Junior 1 нед) — белый/нейтральный (инструменты)
 * - `practice` (Middle) — оранжевый/розовый (практика)
 * - `advanced` (Senior) — красный (продвинутое)
 * - `growth` — серый (дополнительные блоки)
 * - `start` — розовый (стартовый бейдж)
 *
 * Цвета строятся на Tailwind-палитре с HSL-переменными, чтобы работать
 * и в dark, и в light теме без дублирования.
 */

import type { NodeStatus } from './types'

export type NodeColor = 'yellow' | 'lime' | 'white' | 'gray' | 'pink' | 'blue' | 'red'
export type NodeStage =
  | 'start'
  | 'base'
  | 'stage1'
  | 'stage2'
  | 'practice'
  | 'advanced'
  | 'growth'

/** Цвет по стадии — используется, если у узла не задан явный `color`. */
export const STAGE_DEFAULT_COLOR: Record<NodeStage, NodeColor> = {
  start: 'pink',
  base: 'yellow',
  stage1: 'lime',
  stage2: 'white',
  practice: 'pink',
  advanced: 'red',
  growth: 'gray',
}

/** Tailwind-классы фона/рамки/текста карточки. Работают в dark и light. */
export const COLOR_CLASSES: Record<NodeColor, { bg: string; border: string; text: string; accent: string }> = {
  yellow: {
    bg: 'bg-amber-400/15 dark:bg-amber-400/20',
    border: 'border-amber-500/60 dark:border-amber-400/60',
    text: 'text-amber-950 dark:text-amber-50',
    accent: 'text-amber-700 dark:text-amber-300',
  },
  lime: {
    bg: 'bg-lime-400/15 dark:bg-lime-400/20',
    border: 'border-lime-500/60 dark:border-lime-400/60',
    text: 'text-lime-950 dark:text-lime-50',
    accent: 'text-lime-700 dark:text-lime-300',
  },
  white: {
    bg: 'bg-neutral-50 dark:bg-neutral-800/60',
    border: 'border-neutral-300 dark:border-neutral-600',
    text: 'text-neutral-900 dark:text-neutral-50',
    accent: 'text-neutral-600 dark:text-neutral-300',
  },
  gray: {
    bg: 'bg-neutral-200/60 dark:bg-neutral-700/40',
    border: 'border-neutral-400 dark:border-neutral-500',
    text: 'text-neutral-900 dark:text-neutral-100',
    accent: 'text-neutral-600 dark:text-neutral-400',
  },
  pink: {
    bg: 'bg-pink-500/15 dark:bg-pink-500/25',
    border: 'border-pink-500/70 dark:border-pink-400/70',
    text: 'text-pink-950 dark:text-pink-50',
    accent: 'text-pink-700 dark:text-pink-300',
  },
  blue: {
    bg: 'bg-sky-400/15 dark:bg-sky-400/20',
    border: 'border-sky-500/60 dark:border-sky-400/60',
    text: 'text-sky-950 dark:text-sky-50',
    accent: 'text-sky-700 dark:text-sky-300',
  },
  red: {
    bg: 'bg-red-500/15 dark:bg-red-500/25',
    border: 'border-red-500/60 dark:border-red-400/60',
    text: 'text-red-950 dark:text-red-50',
    accent: 'text-red-700 dark:text-red-300',
  },
}

/** Оверлей-статус (locked/in-progress/completed) поверх цвета стадии. */
export const STATUS_RING: Record<NodeStatus, string> = {
  locked: 'opacity-60 ring-0',
  available: 'ring-0',
  'in-progress': 'ring-2 ring-info ring-offset-2 ring-offset-background',
  completed: 'ring-2 ring-success ring-offset-2 ring-offset-background',
}

/**
 * Возвращает итоговые классы для карточки узла:
 * - цвет по color (fallback → stage → default)
 * - ring по status
 */
export function getNodeClasses(
  color: NodeColor | null,
  stage: NodeStage | null,
  status: NodeStatus,
): { bg: string; border: string; text: string; accent: string; ring: string } {
  const resolvedColor: NodeColor = color ?? (stage != null ? STAGE_DEFAULT_COLOR[stage] : 'white')
  const palette = COLOR_CLASSES[resolvedColor]
  return { ...palette, ring: STATUS_RING[status] }
}

/** Боковые аннотации на графе (рендерятся overlay-слоем поверх ReactFlow). */
export type StageAnnotation = {
  stage: NodeStage
  leftLabel: string
  rightLabel?: string
}

export const STAGE_ANNOTATIONS: StageAnnotation[] = [
  { stage: 'base', leftLabel: '1 неделя\nповторяем базу' },
  {
    stage: 'stage1',
    leftLabel: '2–4 недели\nразработка основы',
    rightLabel: 'Ожидается\nбазовое\nпонимание!',
  },
  { stage: 'stage2', leftLabel: '1 неделя\nосвоение инструментов' },
  { stage: 'practice', leftLabel: '1–2 месяца\nпрактика и\nподготовка к собесу' },
  {
    stage: 'growth',
    leftLabel: 'Рост',
    rightLabel: 'Рост происходит\nза счёт этих\nблоков',
  },
]

/** Разделители уровней (Стажёр / Junior / Middle / Senior) — рисуются справа от стадии. */
export const STAGE_LEVELS: Record<NodeStage, string | null> = {
  start: null,
  base: null,
  stage1: 'Стажёр',
  stage2: 'Junior',
  practice: 'Middle',
  advanced: 'Senior',
  growth: null,
}
