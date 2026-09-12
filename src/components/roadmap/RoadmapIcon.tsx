import type { CSSProperties } from 'react'

import { getIconComponent } from './icon-map'

type Props = {
  name: string | null
  className?: string
  style?: CSSProperties
}

export function RoadmapIcon({ name, className, style }: Props) {
  const Icon = getIconComponent(name)

  // getIconComponent — поиск в константной карте, ссылка на компонент стабильна,
  // но статический анализ этого не видит и считает компонент созданным в рендере
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className={className} style={style} />
}
