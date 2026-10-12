import { describe, expect, it } from 'vitest'

import { compareSlideNames, slideFileName, slideKind, slideNameProblem, slideSourceUrl, slideUrlProblem } from '@/lib/slides'

const FOLDER = 'https://disk.yandex.com/d/vElPjy8GncYsUg'
const disk = (path: string) => `${FOLDER}/${path.split('/').map(encodeURIComponent).join('/')}`

describe('файлы презентации', () => {
  it('имя файла берётся из пути Диска и из адреса медиатеки, с раскодированной кириллицей', () => {
    expect(slideFileName(disk('Легенда/Screenshot 09-03-2025 22.17.47.png'))).toBe('Screenshot 09-03-2025 22.17.47.png')
    expect(slideFileName(disk('Гайд (2025)/как торговаться.pdf'))).toBe('как торговаться.pdf')
    expect(slideFileName('/api/media/file/%D1%81%D0%BB%D0%B0%D0%B9%D0%B4-1.png')).toBe('слайд-1.png')
  })

  it('у ссылки на отдельный файл Диска и у чужого адреса имени в адресе нет', () => {
    expect(slideFileName('https://disk.yandex.ru/i/AbCdEf123')).toBeNull()
    expect(slideFileName('https://example.com/a.png')).toBeNull()
    expect(slideFileName(FOLDER)).toBeNull()
  })

  it.each([
    ['slide.PNG', 'image'], ['фото.jpeg', 'image'], ['a.jpg', 'image'], ['a.webp', 'image'], ['a.gif', 'image'],
    ['guide.pdf', 'pdf'], ['Гайд.PDF', 'pdf'],
    ['deck.pptx', 'file'], ['notes.docx', 'file'], ['photo.heic', 'file'], ['vector.svg', 'file'],
  ])('%s показывается как %s', (name, kind) => {
    expect(slideKind(name)).toBe(kind)
  })

  it('без имени файл остаётся скачиваемым, а не ломает презентацию', () => {
    expect(slideKind(null)).toBe('file')
    expect(slideKind(undefined)).toBe('file')
  })

  it('слайды идут в порядке чисел, а не символов', () => {
    expect(['Слайд 10.png', 'Слайд 2.png', 'Слайд 1.png'].sort(compareSlideNames)).toEqual(['Слайд 1.png', 'Слайд 2.png', 'Слайд 10.png'])
    expect(['b 10.png', 'b 9.png', 'a.png'].sort(compareSlideNames)).toEqual(['a.png', 'b 9.png', 'b 10.png'])
    // Скриншоты macOS: дата и время в имени дают порядок съёмки.
    expect(['Screenshot 09-04-2025 05.23.11.png', 'Screenshot 09-03-2025 22.17.47.png', 'Screenshot 09-03-2025 9.05.00.png'].sort(compareSlideNames))
      .toEqual(['Screenshot 09-03-2025 9.05.00.png', 'Screenshot 09-03-2025 22.17.47.png', 'Screenshot 09-04-2025 05.23.11.png'])
  })

  it('в презентацию попадают только файлы Диска и медиатеки', () => {
    expect(slideUrlProblem(disk('Легенда/1.png'))).toBeNull()
    expect(slideUrlProblem('/api/media/file/slide.png')).toBeNull()
    expect(slideUrlProblem('https://disk.yandex.ru/i/AbCdEf123')).toBeNull()
    expect(slideUrlProblem('https://example.com/a.png')).toContain('Яндекс Диске или в медиатеке')
    expect(slideUrlProblem('javascript:alert(1)')).toContain('Яндекс Диске или в медиатеке')
  })

  it('папку и видео в список файлов положить нельзя', () => {
    expect(slideUrlProblem(FOLDER)).toContain('ссылка на папку')
    expect(slideUrlProblem(disk('Легенда'))).toContain('нет расширения — если это папка')
    expect(slideUrlProblem('/api/media/file/readme')).toBe('у файла нет расширения')
    expect(slideUrlProblem(disk('Курс/урок.mp4'))).toContain('блоком «Видео»')
    expect(slideNameProblem('запись.MKV')).toContain('блоком «Видео»')
    expect(slideNameProblem('слайд.png')).toBeNull()
  })

  it('исходная ссылка Диска открывается через прокси, внутренний адрес остаётся как есть', () => {
    const url = disk('Легенда/1.png')
    expect(slideSourceUrl(url)).toBe(`/api/learning-assets?${new URLSearchParams({ url })}`)
    expect(slideSourceUrl('/api/learning-assets?lesson=1&block=b&asset=x')).toBe('/api/learning-assets?lesson=1&block=b&asset=x')
    expect(slideSourceUrl('/api/media/file/slide.png')).toBe('/api/media/file/slide.png')
  })
})
