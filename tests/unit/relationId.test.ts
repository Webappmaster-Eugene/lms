import { describe, it, expect } from 'vitest'

import { relationId } from '@/lib/relation-id'

describe('relationId', () => {
  it('число возвращается как есть', () => {
    expect(relationId(17)).toBe(17)
  })

  it('развёрнутый документ отдаёт свой id', () => {
    expect(relationId({ id: 17, title: 'Задача' })).toBe(17)
  })

  it('числовая строка приводится к числу', () => {
    // Именно этот случай ломал запись: id из тела запроса приходит строкой
    expect(relationId('17')).toBe(17)
    expect(typeof relationId('17')).toBe('number')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['пустая строка', ''],
    ['не число', 'abc'],
    ['дробь', 1.5],
    ['объект без id', { title: 'Задача' }],
    ['массив', [1]],
  ])('отвергает %s', (_label, value) => {
    expect(() => relationId(value)).toThrow(TypeError)
  })

  it('сообщение об ошибке называет полученное значение', () => {
    expect(() => relationId('abc')).toThrow(/abc/)
  })
})
