export const stageTitle = (stage: number) => stage === 0 ? 'Подготовка проекта' : `Этап ${stage}`

export function tutoringDisplayText(value: string) {
  return value.replaceAll('ё', 'е').replaceAll('Ё', 'Е').replace(/[–—]/g, '-')
    .replace(/([Сс])дайте этапы 00-0?(\d+)/g, '$1дайте подготовку и этап $2')
    .replace(/([Ээ])тапа 00(?!\d)/g, (_, letter: string) => letter === 'Э' ? 'Подготовки' : 'подготовки')
    .replace(/([Ээ])тап 00(?!\d)/g, (_, letter: string) => letter === 'Э' ? 'Подготовка проекта' : 'подготовка проекта')
    .replace(/([Ээ]тап(?:а|ы|е|ов)? )0(\d)(?!\d)/g, '$1$2')
    .replace(/([Ээ]тап(?:а|ы|е|ов)? \d+)-0(\d)(?!\d)/g, '$1-$2')
}
