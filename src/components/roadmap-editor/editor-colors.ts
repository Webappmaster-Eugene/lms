/**
 * Inline-style палитра для editor-узлов.
 *
 * Tailwind-классы не работают внутри Payload admin (CSS не подключён),
 * поэтому editor-компоненты используют inline styles напрямую.
 */

import type { NodeColor, NodeStage } from '@/components/roadmap/stage-colors'
import { STAGE_DEFAULT_COLOR } from '@/components/roadmap/stage-colors'

type ColorStyle = {
  bg: string
  border: string
  text: string
  accent: string
}

const PALETTE: Record<NodeColor, ColorStyle> = {
  yellow: {
    bg: 'rgba(251, 191, 36, 0.18)',
    border: 'rgba(245, 158, 11, 0.6)',
    text: '#fef3c7',
    accent: '#fcd34d',
  },
  lime: {
    bg: 'rgba(163, 230, 53, 0.18)',
    border: 'rgba(132, 204, 22, 0.6)',
    text: '#ecfccb',
    accent: '#bef264',
  },
  white: {
    bg: 'rgba(163, 163, 163, 0.15)',
    border: 'rgba(115, 115, 115, 0.6)',
    text: '#fafafa',
    accent: '#d4d4d4',
  },
  gray: {
    bg: 'rgba(115, 115, 115, 0.15)',
    border: 'rgba(82, 82, 82, 0.6)',
    text: '#e5e5e5',
    accent: '#a3a3a3',
  },
  pink: {
    bg: 'rgba(236, 72, 153, 0.2)',
    border: 'rgba(236, 72, 153, 0.7)',
    text: '#fce7f3',
    accent: '#f9a8d4',
  },
  blue: {
    bg: 'rgba(56, 189, 248, 0.18)',
    border: 'rgba(14, 165, 233, 0.6)',
    text: '#e0f2fe',
    accent: '#7dd3fc',
  },
  red: {
    bg: 'rgba(239, 68, 68, 0.2)',
    border: 'rgba(239, 68, 68, 0.6)',
    text: '#fee2e2',
    accent: '#fca5a5',
  },
}

export type EditorColorStyle = ColorStyle

export function getEditorColors(
  color: NodeColor | null,
  stage: NodeStage | null,
): ColorStyle {
  const resolved: NodeColor = color ?? (stage != null ? STAGE_DEFAULT_COLOR[stage] : 'white')
  return PALETTE[resolved]
}

export function getSelectionOutline(selected: boolean): React.CSSProperties {
  return selected
    ? { outline: '2px solid #3b82f6', outlineOffset: '3px', borderRadius: '10px' }
    : {}
}
