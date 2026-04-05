import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Box,
  CircleDot,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileCode,
  FolderTree,
  GitBranch,
  Globe,
  KeyRound,
  Layers,
  Layout,
  Lock,
  Monitor,
  Network,
  Palette,
  Puzzle,
  Rocket,
  Server,
  Settings,
  Shield,
  Smartphone,
  Terminal,
  TestTube,
  Workflow,
  Zap,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  box: Box,
  'circle-dot': CircleDot,
  cloud: Cloud,
  code2: Code2,
  cpu: Cpu,
  database: Database,
  'file-code': FileCode,
  'folder-tree': FolderTree,
  'git-branch': GitBranch,
  globe: Globe,
  'key-round': KeyRound,
  layers: Layers,
  layout: Layout,
  lock: Lock,
  monitor: Monitor,
  network: Network,
  palette: Palette,
  puzzle: Puzzle,
  rocket: Rocket,
  server: Server,
  settings: Settings,
  shield: Shield,
  smartphone: Smartphone,
  terminal: Terminal,
  'test-tube': TestTube,
  workflow: Workflow,
  zap: Zap,
}

const FALLBACK_ICON = CircleDot

export function getIconComponent(name: string | null): LucideIcon {
  if (!name) return FALLBACK_ICON
  return ICON_MAP[name] ?? FALLBACK_ICON
}
