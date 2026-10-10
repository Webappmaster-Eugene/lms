import type { TrainerTopicSeed } from './types'

export const jsInterviewTopic: TrainerTopicSeed = {
  slug: 'js-interview-practice',
  title: 'JavaScript и TypeScript: практика собеседований',
  description: 'Авторские задачи на алгоритмы, обработку данных и управление асинхронной очередью',
  category: 'javascript',
  icon: '💬',
  order: 21,
  tasks: [
    {
      slug: 'interview-js-equal-range',
      title: 'Границы повторяющегося значения',
      difficulty: 'medium',
      entryName: 'equalRange',
      interviewFormat: 'algorithms',
      recommendedMinutes: 20,
      tags: [
        'arrays',
        'binary-search',
        'livecoding',
      ],
      descriptionMd: 'Реализуйте equalRange(numbers, target): вернуть [first, last] — индексы первого и последнего вхождения target в отсортированном по возрастанию массиве. Если значения нет, верните [-1, -1]. Массив не изменяйте. До100000 чисел, все значения — безопасные целые; повторы разрешены. Требуемая сложность O(log n), дополнительная память O(1). Пример: equalRange([1,2,2,2,5],2) → [1,3]. На интервью объясните две границы поиска и проверьте пустой массив. Это авторская задача для подготовки, а не подтверждённый вопрос компании.',
      starterCodeTs: `function equalRange(numbers: readonly number[], target: number): number[] {
  return [-1, -1]
}`,
      solutionCodeTs: `function equalRange(numbers: readonly number[], target: number): number[] {
  function bound(after: boolean): number {
    let left = 0
    let right = numbers.length
    while (left < right) {
      const middle = left + Math.floor((right - left) / 2)
      if (numbers[middle] < target || (after && numbers[middle] === target)) left = middle + 1
      else right = middle
    }
    return left
  }
  const first = bound(false)
  return first < numbers.length && numbers[first] === target ? [first, bound(true) - 1] : [-1, -1]
}`,
      solutionNotes: 'Первый поиск находит нижнюю границу, второй — первую позицию строго большего элемента. Не обходите весь диапазон повторений.',
      hints: [
        'Работайте с полуинтервалом [left,right).',
        'Для последней позиции найдите upper bound и вычтите1.',
      ],
      cases: [
        {
          name: 'Повторы в середине',
          args: [
            [
              1,
              2,
              2,
              2,
              5,
            ],
            2,
          ],
          expected: [
            1,
            3,
          ],
          hidden: false,
        },
        {
          name: 'Пустой массив',
          args: [
            [],
            1,
          ],
          expected: [
            -1,
            -1,
          ],
          hidden: false,
        },
        {
          name: 'Значения нет',
          args: [
            [
              1,
              3,
              5,
            ],
            2,
          ],
          expected: [
            -1,
            -1,
          ],
          hidden: false,
        },
        {
          name: 'Все равны',
          args: [
            [
              4,
              4,
              4,
              4,
            ],
            4,
          ],
          expected: [
            0,
            3,
          ],
          hidden: true,
        },
        {
          name: 'Левая граница',
          args: [
            [
              1,
              1,
              2,
            ],
            1,
          ],
          expected: [
            0,
            1,
          ],
          hidden: true,
        },
        {
          name: 'Правая граница',
          args: [
            [
              1,
              2,
              2,
            ],
            2,
          ],
          expected: [
            1,
            2,
          ],
          hidden: true,
        },
        {
          name: 'Отрицательные',
          args: [
            [
              -7,
              -3,
              -3,
              0,
            ],
            -3,
          ],
          expected: [
            1,
            2,
          ],
          hidden: true,
        },
        {
          name: 'Один элемент',
          args: [
            [
              9,
            ],
            9,
          ],
          expected: [
            0,
            0,
          ],
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[[1,2,2,2,5],2]
  const before=JSON.stringify(args)
  await equalRange(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function equalRange(numbers, target) {
    function bound(after) {
        let left = 0;
        let right = numbers.length;
        while (left < right) {
            const middle = left + Math.floor((right - left) / 2);
            if (numbers[middle] < target || (after && numbers[middle] === target))
                left = middle + 1;
            else
                right = middle;
        }
        return left;
    }
    const first = bound(false);
    return first < numbers.length && numbers[first] === target ? [first, bound(true) - 1] : [-1, -1];
}
`,
      starterCode: `function equalRange(numbers, target) {
    return [-1, -1];
}
`,
      companies: [
        'microsoft',
      ],
      sourceUrl: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-js-min-budget-window',
      title: 'Минимальное окно с нужной суммой',
      difficulty: 'medium',
      entryName: 'minimumWindow',
      interviewFormat: 'algorithms',
      recommendedMinutes: 25,
      tags: [
        'arrays',
        'sliding-window',
        'two-pointers',
      ],
      descriptionMd: 'Реализуйте minimumWindow(values, target): длина самого короткого непрерывного фрагмента массива, сумма которого не меньше target. Если такого фрагмента нет, верните0. values содержит неотрицательные целые, target — положительное целое. Массив до100000 элементов; все промежуточные суммы безопасные целые JS. Требуются O(n) времени и O(1) памяти, вход менять нельзя. Пример: minimumWindow([2,3,1,2,4,3],7) →2. Объясните, почему два указателя корректны именно для неотрицательных значений.',
      starterCodeTs: `function minimumWindow(values: readonly number[], target: number): number {
  return 0
}`,
      solutionCodeTs: `function minimumWindow(values: readonly number[], target: number): number {
  let left = 0
  let sum = 0
  let best = values.length + 1
  for (let right = 0; right < values.length; right += 1) {
    sum += values[right]
    while (sum >= target && left <= right) {
      best = Math.min(best, right - left + 1)
      sum -= values[left]
      left += 1
    }
  }
  return best > values.length ? 0 : best
}`,
      solutionNotes: 'Правая граница расширяет окно, левая сжимает его, пока сумма удовлетворяет условию. Каждый элемент входит и выходит из окна один раз.',
      hints: [
        'Поддерживайте текущую сумму окна.',
        'Нули не должны мешать сжатию окна.',
      ],
      cases: [
        {
          name: 'Окно в конце',
          args: [
            [
              2,
              3,
              1,
              2,
              4,
              3,
            ],
            7,
          ],
          expected: 2,
          hidden: false,
        },
        {
          name: 'Один большой элемент',
          args: [
            [
              1,
              9,
              2,
            ],
            8,
          ],
          expected: 1,
          hidden: false,
        },
        {
          name: 'Нет результата',
          args: [
            [
              1,
              2,
            ],
            8,
          ],
          expected: 0,
          hidden: false,
        },
        {
          name: 'Пустой массив',
          args: [
            [],
            1,
          ],
          expected: 0,
          hidden: true,
        },
        {
          name: 'Нули',
          args: [
            [
              0,
              0,
              4,
              0,
            ],
            4,
          ],
          expected: 1,
          hidden: true,
        },
        {
          name: 'Весь массив',
          args: [
            [
              1,
              1,
              1,
              1,
            ],
            4,
          ],
          expected: 4,
          hidden: true,
        },
        {
          name: 'Несколько минимумов',
          args: [
            [
              2,
              2,
              2,
            ],
            4,
          ],
          expected: 2,
          hidden: true,
        },
        {
          name: 'Без переполнения int32',
          args: [
            [
              4000000000,
              1,
              4000000000,
            ],
            8000000000,
          ],
          expected: 3,
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[[2,3,1,2,4,3],7]
  const before=JSON.stringify(args)
  await minimumWindow(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function minimumWindow(values, target) {
    let left = 0;
    let sum = 0;
    let best = values.length + 1;
    for (let right = 0; right < values.length; right += 1) {
        sum += values[right];
        while (sum >= target && left <= right) {
            best = Math.min(best, right - left + 1);
            sum -= values[left];
            left += 1;
        }
    }
    return best > values.length ? 0 : best;
}
`,
      starterCode: `function minimumWindow(values, target) {
    return 0;
}
`,
      companies: [
        'microsoft',
      ],
      sourceUrl: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-js-next-increase',
      title: 'Расстояние до следующего большего значения',
      difficulty: 'medium',
      entryName: 'nextIncrease',
      interviewFormat: 'algorithms',
      recommendedMinutes: 25,
      tags: [
        'arrays',
        'stack',
      ],
      descriptionMd: 'Реализуйте nextIncrease(values). Для каждой позиции верните расстояние до первой позиции справа со строго большим значением, либо0, если её нет. Равные значения не подходят. До100000 безопасных целых; массив не изменяйте. Пример: [3,1,2,5] → [3,1,1,0]. Требуется O(n) времени. Разберите, почему хранить индексы в монотонном стеке удобнее, чем сами значения.',
      starterCodeTs: `function nextIncrease(values: readonly number[]): number[] {
  return []
}`,
      solutionCodeTs: `function nextIncrease(values: readonly number[]): number[] {
  const result = new Array<number>(values.length).fill(0)
  const stack: number[] = []
  for (let index = 0; index < values.length; index += 1) {
    while (stack.length && values[stack[stack.length - 1]] < values[index]) {
      const previous = stack[stack.length - 1]
      stack.pop()
      result[previous] = index - previous
    }
    stack.push(index)
  }
  return result
}`,
      solutionNotes: 'Каждый индекс кладётся в стек и извлекается не больше одного раза. Строгое сравнение сохраняет равные значения в ожидании.',
      hints: [
        'Начните с результата, заполненного нулями.',
        'Снимайте со стека все меньшие элементы.',
      ],
      cases: [
        {
          name: 'Разные расстояния',
          args: [
            [
              3,
              1,
              2,
              5,
            ],
          ],
          expected: [
            3,
            1,
            1,
            0,
          ],
          hidden: false,
        },
        {
          name: 'Пустой массив',
          args: [
            [],
          ],
          expected: [],
          hidden: false,
        },
        {
          name: 'Убывание',
          args: [
            [
              5,
              4,
              3,
            ],
          ],
          expected: [
            0,
            0,
            0,
          ],
          hidden: false,
        },
        {
          name: 'Возрастание',
          args: [
            [
              1,
              2,
              3,
            ],
          ],
          expected: [
            1,
            1,
            0,
          ],
          hidden: true,
        },
        {
          name: 'Равные значения',
          args: [
            [
              2,
              2,
              3,
            ],
          ],
          expected: [
            2,
            1,
            0,
          ],
          hidden: true,
        },
        {
          name: 'Все равны',
          args: [
            [
              8,
              8,
              8,
            ],
          ],
          expected: [
            0,
            0,
            0,
          ],
          hidden: true,
        },
        {
          name: 'Отрицательные',
          args: [
            [
              0,
              -2,
              -1,
              1,
            ],
          ],
          expected: [
            3,
            1,
            1,
            0,
          ],
          hidden: true,
        },
        {
          name: 'Один элемент',
          args: [
            [
              4,
            ],
          ],
          expected: [
            0,
          ],
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[[3,1,2,5]]
  const before=JSON.stringify(args)
  await nextIncrease(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function nextIncrease(values) {
    const result = new Array(values.length).fill(0);
    const stack = [];
    for (let index = 0; index < values.length; index += 1) {
        while (stack.length && values[stack[stack.length - 1]] < values[index]) {
            const previous = stack[stack.length - 1];
            stack.pop();
            result[previous] = index - previous;
        }
        stack.push(index);
    }
    return result;
}
`,
      starterCode: `function nextIncrease(values) {
    return [];
}
`,
      companies: [
        'microsoft',
      ],
      sourceUrl: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-js-id-ranges',
      title: 'Сжатие последовательных идентификаторов',
      difficulty: 'easy',
      entryName: 'idRanges',
      interviewFormat: 'livecoding',
      recommendedMinutes: 15,
      tags: [
        'arrays',
        'two-pointers',
      ],
      descriptionMd: 'Реализуйте idRanges(ids): преобразуйте строго возрастающий массив целых идентификаторов в массив включительных диапазонов [start,end]. Каждый диапазон содержит последовательные целые числа, соседние диапазоны объединяются только при отсутствии пропуска. Пример: [-2,-1,0,4,6,7] → [[-2,0],[4,4],[6,7]]. Пустой вход даёт[]. До100000 чисел по модулю не больше10^9; вход не меняйте. Требуется один проход.',
      starterCodeTs: `function idRanges(ids: readonly number[]): number[][] {
  return []
}`,
      solutionCodeTs: `function idRanges(ids: readonly number[]): number[][] {
  const result: number[][] = []
  for (const id of ids) {
    const last = result[result.length - 1]
    if (last && id === last[1] + 1) last[1] = id
    else result.push([id, id])
  }
  return result
}`,
      solutionNotes: 'Меняется только последний диапазон нового результата; исходный массив остаётся прежним.',
      hints: [
        'Следующее число продолжает диапазон, если равно end+1.',
      ],
      cases: [
        {
          name: 'Диапазоны и одиночные',
          args: [
            [
              -2,
              -1,
              0,
              4,
              6,
              7,
            ],
          ],
          expected: [
            [
              -2,
              0,
            ],
            [
              4,
              4,
            ],
            [
              6,
              7,
            ],
          ],
          hidden: false,
        },
        {
          name: 'Пустой вход',
          args: [
            [],
          ],
          expected: [],
          hidden: false,
        },
        {
          name: 'Одиночный',
          args: [
            [
              9,
            ],
          ],
          expected: [
            [
              9,
              9,
            ],
          ],
          hidden: false,
        },
        {
          name: 'Один диапазон',
          args: [
            [
              1,
              2,
              3,
            ],
          ],
          expected: [
            [
              1,
              3,
            ],
          ],
          hidden: true,
        },
        {
          name: 'Все с пропусками',
          args: [
            [
              1,
              3,
              5,
            ],
          ],
          expected: [
            [
              1,
              1,
            ],
            [
              3,
              3,
            ],
            [
              5,
              5,
            ],
          ],
          hidden: true,
        },
        {
          name: 'Отрицательные',
          args: [
            [
              -5,
              -4,
              -2,
            ],
          ],
          expected: [
            [
              -5,
              -4,
            ],
            [
              -2,
              -2,
            ],
          ],
          hidden: true,
        },
        {
          name: 'Большие id',
          args: [
            [
              999999999,
              1000000000,
            ],
          ],
          expected: [
            [
              999999999,
              1000000000,
            ],
          ],
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[[-2,-1,0,4,6,7]]
  const before=JSON.stringify(args)
  await idRanges(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function idRanges(ids) {
    const result = [];
    for (const id of ids) {
        const last = result[result.length - 1];
        if (last && id === last[1] + 1)
            last[1] = id;
        else
            result.push([id, id]);
    }
    return result;
}
`,
      starterCode: `function idRanges(ids) {
    return [];
}
`,
      companies: [
        'microsoft',
      ],
      sourceUrl: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-js-first-unique-request',
      title: 'Первый неповторяющийся ключ запроса',
      difficulty: 'easy',
      entryName: 'firstUniqueRequest',
      interviewFormat: 'livecoding',
      recommendedMinutes: 15,
      tags: [
        'hash-table',
        'arrays',
      ],
      descriptionMd: 'Реализуйте firstUniqueRequest(keys): верните первый ключ массива, который встречается ровно один раз, или null, если такого ключа нет. Порядок — порядок исходного массива. Ключи — произвольные строки, включая пустую строку и __proto__, регистр важен. До100000 ключей. Не меняйте вход, используйте O(n) времени. Пример: ["a","b","a","c"] → "b".',
      starterCodeTs: `function firstUniqueRequest(keys: readonly string[]): string | null {
  return null
}`,
      solutionCodeTs: `function firstUniqueRequest(keys: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  for (const key of keys) if (counts.get(key) === 1) return key
  return null
}`,
      solutionNotes: 'Два прохода: частоты и выбор первого уникального. Map безопасно обрабатывает ключи, совпадающие со свойствами Object.prototype.',
      hints: [
        'Не возвращайте ключ с минимальной частотой, если она больше1.',
        'Пустая строка может быть правильным ответом.',
      ],
      cases: [
        {
          name: 'Первый уникальный',
          args: [
            [
              'a',
              'b',
              'a',
              'c',
            ],
          ],
          expected: 'b',
          hidden: false,
        },
        {
          name: 'Все повторяются',
          args: [
            [
              'x',
              'x',
            ],
          ],
          expected: null,
          hidden: false,
        },
        {
          name: 'Пустой массив',
          args: [
            [],
          ],
          expected: null,
          hidden: false,
        },
        {
          name: 'Пустая строка',
          args: [
            [
              '',
              'x',
              'x',
            ],
          ],
          expected: '',
          hidden: true,
        },
        {
          name: 'Ключ прототипа',
          args: [
            [
              '__proto__',
              'a',
              'a',
            ],
          ],
          expected: '__proto__',
          hidden: true,
        },
        {
          name: 'Разный регистр',
          args: [
            [
              'A',
              'a',
              'A',
            ],
          ],
          expected: 'a',
          hidden: true,
        },
        {
          name: 'Кириллица',
          args: [
            [
              'один',
              'два',
              'один',
              'три',
            ],
          ],
          expected: 'два',
          hidden: true,
        },
        {
          name: 'Уникальный в конце',
          args: [
            [
              'x',
              'y',
              'x',
              'y',
              'z',
            ],
          ],
          expected: 'z',
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[["a","b","a","c"]]
  const before=JSON.stringify(args)
  await firstUniqueRequest(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function firstUniqueRequest(keys) {
    const counts = new Map();
    for (const key of keys)
        counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const key of keys)
        if (counts.get(key) === 1)
            return key;
    return null;
}
`,
      starterCode: `function firstUniqueRequest(keys) {
    return null;
}
`,
      companies: [
        'uber',
      ],
      sourceUrl: 'https://jobs.uber.com/en/people-stories/interview-prep/landing-the-job-at-uber-front-end-engineer/',
      companyEvidence: [
        {
          company: 'uber',
          kind: 'preparation',
          url: 'https://jobs.uber.com/en/people-stories/interview-prep/landing-the-job-at-uber-front-end-engineer/',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-js-user-order-summary',
      title: 'Сводка заказов с сохранением пользователей',
      difficulty: 'medium',
      entryName: 'userOrderSummary',
      interviewFormat: 'livecoding',
      recommendedMinutes: 25,
      tags: [
        'hash-table',
        'arrays',
        'objects',
      ],
      descriptionMd: 'Реализуйте userOrderSummary(users, orders). users — массив {id:string,name:string} с уникальными id. orders — массив {userId:string,amount:number}; amount — целые копейки, может быть отрицательным (возврат). Верните новый массив {id,name,count,total} в порядке users. Заказы неизвестных пользователей игнорируйте; пользователь без заказов получает count:0,total:0. Все суммы безопасные целые, до10000 пользователей и100000 заказов. Вход не меняйте; O(users+orders). Пример users=[{id:"u",name:"Ира"}], orders=[{userId:"u",amount:70},{userId:"u",amount:-20}] → [{id:"u",name:"Ира",count:2,total:50}].',
      starterCodeTs: `type SummaryUser = { id: string; name: string }
type SummaryOrder = { userId: string; amount: number }
function userOrderSummary(users: readonly SummaryUser[], orders: readonly SummaryOrder[]): Array<SummaryUser & {count:number;total:number}> {
  return []
}`,
      solutionCodeTs: `type SummaryUser = { id: string; name: string }
type SummaryOrder = { userId: string; amount: number }
function userOrderSummary(users: readonly SummaryUser[], orders: readonly SummaryOrder[]): Array<SummaryUser & {count:number;total:number}> {
  const result = users.map(user => ({ ...user, count: 0, total: 0 }))
  const byId = new Map(result.map(user => [user.id, user]))
  for (const order of orders) {
    const user = byId.get(order.userId)
    if (user) { user.count += 1; user.total += order.amount }
  }
  return result
}`,
      solutionNotes: 'Индекс по id позволяет обновлять новую сводку без поиска по всему users. Создавайте новые объекты, чтобы не мутировать исходные записи.',
      hints: [
        'Создайте result сразу для всех пользователей.',
        'Для внешних строковых id используйте Map.',
      ],
      cases: [
        {
          name: 'С покупкой и возвратом',
          args: [
            [
              {
                id: 'u',
                name: 'Ира',
              },
            ],
            [
              {
                userId: 'u',
                amount: 70,
              },
              {
                userId: 'u',
                amount: -20,
              },
            ],
          ],
          expected: [
            {
              id: 'u',
              name: 'Ира',
              count: 2,
              total: 50,
            },
          ],
          hidden: false,
        },
        {
          name: 'Без заказов',
          args: [
            [
              {
                id: 'a',
                name: 'Аня',
              },
            ],
            [],
          ],
          expected: [
            {
              id: 'a',
              name: 'Аня',
              count: 0,
              total: 0,
            },
          ],
          hidden: false,
        },
        {
          name: 'Пустые пользователи',
          args: [
            [],
            [
              {
                userId: 'x',
                amount: 1,
              },
            ],
          ],
          expected: [],
          hidden: false,
        },
        {
          name: 'Неизвестный пользователь',
          args: [
            [
              {
                id: 'u',
                name: 'Ира',
              },
            ],
            [
              {
                userId: 'x',
                amount: 9,
              },
            ],
          ],
          expected: [
            {
              id: 'u',
              name: 'Ира',
              count: 0,
              total: 0,
            },
          ],
          hidden: true,
        },
        {
          name: 'Порядок users',
          args: [
            [
              {
                id: 'b',
                name: 'Боря',
              },
              {
                id: 'a',
                name: 'Аня',
              },
            ],
            [
              {
                userId: 'a',
                amount: 2,
              },
              {
                userId: 'b',
                amount: 3,
              },
            ],
          ],
          expected: [
            {
              id: 'b',
              name: 'Боря',
              count: 1,
              total: 3,
            },
            {
              id: 'a',
              name: 'Аня',
              count: 1,
              total: 2,
            },
          ],
          hidden: true,
        },
        {
          name: 'Ключ __proto__',
          args: [
            [
              {
                id: '__proto__',
                name: 'П',
              },
            ],
            [
              {
                userId: '__proto__',
                amount: 0,
              },
            ],
          ],
          expected: [
            {
              id: '__proto__',
              name: 'П',
              count: 1,
              total: 0,
            },
          ],
          hidden: true,
        },
        {
          name: 'Большие суммы',
          args: [
            [
              {
                id: 'u',
                name: 'У',
              },
            ],
            [
              {
                userId: 'u',
                amount: 4000000000,
              },
              {
                userId: 'u',
                amount: 2,
              },
            ],
          ],
          expected: [
            {
              id: 'u',
              name: 'У',
              count: 2,
              total: 4000000002,
            },
          ],
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[[{"id":"u","name":"Ира"}],[{"userId":"u","amount":70},{"userId":"u","amount":-20}]]
  const before=JSON.stringify(args)
  await userOrderSummary(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function userOrderSummary(users, orders) {
    const result = users.map(user => ({ ...user, count: 0, total: 0 }));
    const byId = new Map(result.map(user => [user.id, user]));
    for (const order of orders) {
        const user = byId.get(order.userId);
        if (user) {
            user.count += 1;
            user.total += order.amount;
        }
    }
    return result;
}
`,
      starterCode: `function userOrderSummary(users, orders) {
    return [];
}
`,
      companies: [
        'uber',
      ],
      sourceUrl: 'https://jobs.uber.com/en/people-stories/interview-prep/landing-the-job-at-uber-front-end-engineer/',
      companyEvidence: [
        {
          company: 'uber',
          kind: 'preparation',
          url: 'https://jobs.uber.com/en/people-stories/interview-prep/landing-the-job-at-uber-front-end-engineer/',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-js-fair-round-robin',
      title: 'Справедливый обход независимых очередей',
      difficulty: 'medium',
      entryName: 'roundRobin',
      interviewFormat: 'algorithms',
      recommendedMinutes: 20,
      tags: [
        'queue',
        'arrays',
      ],
      descriptionMd: 'Реализуйте roundRobin(queues): берите по одному элементу из каждой непустой очереди слева направо, затем повторяйте круг для очередей, где остались элементы. Верните плоский массив. Пример: [[1,2,3],[],[8,9],[4]] → [1,8,4,2,9,3]. До1000 очередей и100000 элементов суммарно. Не меняйте вход; ожидается O(суммарных элементов + очередей), без повторного сканирования уже пустых очередей.',
      starterCodeTs: `function roundRobin(queues: readonly (readonly number[])[]): number[] {
  return []
}`,
      solutionCodeTs: `function roundRobin(queues: readonly (readonly number[])[]): number[] {
  const result: number[] = []
  const active: number[] = []
  const positions = new Array<number>(queues.length).fill(0)
  queues.forEach((queue, index) => { if (queue.length) active.push(index) })
  for (let head = 0; head < active.length; head += 1) {
    const index = active[head]
    result.push(queues[index][positions[index]])
    positions[index] += 1
    if (positions[index] < queues[index].length) active.push(index)
  }
  return result
}`,
      solutionNotes: 'Очередь индексов хранит только активные источники. Вместо shift используйте индекс head.',
      hints: [
        'Верните индекс в конец active, если его очередь ещё не закончилась.',
      ],
      cases: [
        {
          name: 'Очереди разной длины',
          args: [
            [
              [
                1,
                2,
                3,
              ],
              [],
              [
                8,
                9,
              ],
              [
                4,
              ],
            ],
          ],
          expected: [
            1,
            8,
            4,
            2,
            9,
            3,
          ],
          hidden: false,
        },
        {
          name: 'Нет очередей',
          args: [
            [],
          ],
          expected: [],
          hidden: false,
        },
        {
          name: 'Все пустые',
          args: [
            [
              [],
              [],
              [],
            ],
          ],
          expected: [],
          hidden: false,
        },
        {
          name: 'Одна очередь',
          args: [
            [
              [
                4,
                5,
              ],
            ],
          ],
          expected: [
            4,
            5,
          ],
          hidden: true,
        },
        {
          name: 'По одному',
          args: [
            [
              [
                1,
              ],
              [
                2,
              ],
              [
                3,
              ],
            ],
          ],
          expected: [
            1,
            2,
            3,
          ],
          hidden: true,
        },
        {
          name: 'Длинная последняя',
          args: [
            [
              [
                1,
              ],
              [
                2,
                3,
                4,
              ],
            ],
          ],
          expected: [
            1,
            2,
            3,
            4,
          ],
          hidden: true,
        },
        {
          name: 'Отрицательные и повторы',
          args: [
            [
              [
                0,
                0,
              ],
              [
                -1,
                -2,
              ],
            ],
          ],
          expected: [
            0,
            -1,
            0,
            -2,
          ],
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[[[1,2,3],[],[8,9],[4]]]
  const before=JSON.stringify(args)
  await roundRobin(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function roundRobin(queues) {
    const result = [];
    const active = [];
    const positions = new Array(queues.length).fill(0);
    queues.forEach((queue, index) => { if (queue.length)
        active.push(index); });
    for (let head = 0; head < active.length; head += 1) {
        const index = active[head];
        result.push(queues[index][positions[index]]);
        positions[index] += 1;
        if (positions[index] < queues[index].length)
            active.push(index);
    }
    return result;
}
`,
      starterCode: `function roundRobin(queues) {
    return [];
}
`,
      companies: [
        'microsoft',
      ],
      sourceUrl: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-js-cancellable-settled-pool',
      title: 'Пул с отменой очереди и сбором ошибок',
      difficulty: 'hard',
      entryName: 'settledPool',
      interviewFormat: 'livecoding',
      recommendedMinutes: 40,
      tags: [
        'async',
        'promise',
        'concurrency',
        'cancelation',
      ],
      descriptionMd: 'Реализуйте settledPool(tasks, limit, signal). tasks — массив функций, возвращающих значение или Promise<number>. Одновременно начаты не больше limit задач; освободившийся слот сразу берёт следующую. Возвращается Promise массива в исходном порядке: {status:"fulfilled",value:number}, {status:"rejected",reason:string} или {status:"skipped"}. Ошибка одной задачи не останавливает другие; reason — error.message для Error, иначе String(error). После signal.aborted=true не начинайте новые задачи, но дождитесь уже начатых. signal — объект с readonly aborted:boolean (подходит AbortController.signal). До1000 задач. limit обязан быть положительным целым; иначе Promise отклоняется RangeError до первого запуска. Пустой вход даёт[]. Таймеры тестов виртуальные: await __clock.runAll() или tick(ms), реальный sleep не нужен. Автотесты проверяют порядок, лимит, синхронные исключения, отклонения и пропуск очереди при отмене.',
      starterCodeTs: `type PoolOutcome = {status:'fulfilled';value:number} | {status:'rejected';reason:string} | {status:'skipped'}
async function settledPool(tasks: Array<() => number | Promise<number>>, limit: number, signal: {readonly aborted:boolean}): Promise<PoolOutcome[]> {
  return []
}`,
      solutionCodeTs: `type PoolOutcome = {status:'fulfilled';value:number} | {status:'rejected';reason:string} | {status:'skipped'}
async function settledPool(tasks: Array<() => number | Promise<number>>, limit: number, signal: {readonly aborted:boolean}): Promise<PoolOutcome[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit')
  const result: PoolOutcome[] = tasks.map(() => ({ status: 'skipped' }))
  let next = 0
  async function worker(): Promise<void> {
    while (next < tasks.length && !signal.aborted) {
      const index = next++
      try { result[index] = { status: 'fulfilled', value: await tasks[index]() } }
      catch (error) { result[index] = { status: 'rejected', reason: error instanceof Error ? error.message : String(error) } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()))
  return result
}`,
      solutionNotes: 'Разделите отмену подачи новых задач и завершение уже начатых. Каждая дорожка обрабатывает ошибки самостоятельно; shared cursor выдаёт уникальные индексы.',
      hints: [
        'Сначала заполните ответ skipped: это состояние неначатых задач.',
        'Проверяйте signal.aborted перед каждым получением нового индекса.',
      ],
      testCode: `test('пустой вход', async () => {
  await expect(settledPool([], 2, {aborted:false})).resolves.toEqual([])
})
test('синхронные значения', async () => {
  await expect(settledPool([() => 1, () => 2], 1, {aborted:false})).resolves.toEqual([{status:'fulfilled',value:1},{status:'fulfilled',value:2}])
})
test('порядок при разной длительности', async () => {
  const promise = settledPool([() => new Promise(resolve => setTimeout(() => resolve(1),30)), () => new Promise(resolve => setTimeout(() => resolve(2),5))],2,{aborted:false})
  await __clock.runAll()
  await expect(promise).resolves.toEqual([{status:'fulfilled',value:1},{status:'fulfilled',value:2}])
})
__tr.register({name:'ошибки не прерывают соседей',hidden:true}, async () => {
  const promise = settledPool([() => {throw new Error('sync')}, () => Promise.reject('async'), () => 3],2,{aborted:false})
  await expect(promise).resolves.toEqual([{status:'rejected',reason:'sync'},{status:'rejected',reason:'async'},{status:'fulfilled',value:3}])
})
__tr.register({name:'лимит и немедленное заполнение слота',hidden:true}, async () => {
  let active = 0
  let peak = 0
  const started = []
  const tasks = [20,5,3,1].map((ms,index) => () => {started.push(index); active++; peak=Math.max(peak,active); return new Promise(resolve => setTimeout(() => {active--;resolve(index)},ms))})
  const promise = settledPool(tasks,2,{aborted:false})
  await __clock.tick(5)
  expect(started).toEqual([0,1,2])
  expect(peak).toBe(2)
  await __clock.runAll()
  await expect(promise).resolves.toEqual([0,1,2,3].map(value => ({status:'fulfilled',value})))
})
__tr.register({name:'отмена до запуска',hidden:true}, async () => {
  let calls=0
  await expect(settledPool([() => {calls++;return 1}],1,{aborted:true})).resolves.toEqual([{status:'skipped'}])
  expect(calls).toBe(0)
})
__tr.register({name:'отмена не обрывает начатые задачи',hidden:true}, async () => {
  const signal={aborted:false}
  const started=[]
  const tasks=[10,20,30,40].map((ms,index)=>()=>{started.push(index);return new Promise(resolve=>setTimeout(()=>resolve(index),ms))})
  const promise=settledPool(tasks,2,signal)
  signal.aborted=true
  await __clock.runAll()
  expect(started).toEqual([0,1])
  await expect(promise).resolves.toEqual([{status:'fulfilled',value:0},{status:'fulfilled',value:1},{status:'skipped'},{status:'skipped'}])
})
__tr.register({name:'невалидный лимит не запускает работу',hidden:true}, async () => {
  for (const limit of [0,-1,1.5,NaN]) {
    let calls=0
    await expect(settledPool([()=>{calls++;return 1}],limit,{aborted:false})).rejects.toThrow(RangeError)
    expect(calls).toBe(0)
  }
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `async function settledPool(tasks, limit, signal) {
    if (!Number.isInteger(limit) || limit < 1)
        throw new RangeError('limit');
    const result = tasks.map(() => ({ status: 'skipped' }));
    let next = 0;
    async function worker() {
        while (next < tasks.length && !signal.aborted) {
            const index = next++;
            try {
                result[index] = { status: 'fulfilled', value: await tasks[index]() };
            }
            catch (error) {
                result[index] = { status: 'rejected', reason: error instanceof Error ? error.message : String(error) };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
    return result;
}
`,
      starterCode: `async function settledPool(tasks, limit, signal) {
    return [];
}
`,
      companies: [
        'microsoft',
      ],
      sourceUrl: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
    },
    {
      slug: 'interview-ozon-json-category-tree',
      title: 'Route 256: дерево JSON-категорий (адаптация)',
      difficulty: 'medium',
      entryName: 'categoryTree',
      interviewFormat: 'algorithms',
      recommendedMinutes: 25,
      tags: [
        'tree',
        'hash-table',
        'objects',
      ],
      sourceUrl: 'https://habr.com/ru/companies/ozontech/articles/833762/',
      companyEvidence: [
        {
          company: 'ozon',
          kind: 'official',
          url: 'https://habr.com/ru/companies/ozontech/articles/833762/',
          note: 'JS/TS-адаптация опубликованного отбора Route 256; не frontend live-coding, частота неизвестна.',
          checkedAt: '2026-10-10',
        },
      ],
      descriptionMd: 'Соберите categoryTree(categories): записи {id,name,parent?} превратите в корень {id,name,next:[...]}. Корень id0 без parent; остальные ссылаются на существующего родителя. Вход гарантированно описывает связное дерево с уникальными неотрицательными id; порядок записей произвольный. В next сохраняйте порядок появления детей во входе, для листа next:[]. До10000 категорий; вход не изменяйте. JS/TS-контракт — учебная адаптация опубликованного отбора Route 256, не frontend-интервью.',
      starterCodeTs: `type InputCategory = {id:number;name:string;parent?:number}
type CategoryNode = {id:number;name:string;next:CategoryNode[]}
function categoryTree(categories: readonly InputCategory[]): CategoryNode {
  return {id:0,name:'',next:[]}
}`,
      solutionCodeTs: `type InputCategory = {id:number;name:string;parent?:number}
type CategoryNode = {id:number;name:string;next:CategoryNode[]}
function categoryTree(categories: readonly InputCategory[]): CategoryNode {
  const nodes = new Map<number,CategoryNode>()
  for (const category of categories) nodes.set(category.id,{id:category.id,name:category.name,next:[]})
  for (const category of categories) {
    if (category.id === 0) continue
    const parent = nodes.get(category.parent ?? -1)
    const node = nodes.get(category.id)
    if (parent && node) parent.next.push(node)
  }
  const root = nodes.get(0)
  if (!root) throw new Error('root')
  return root
}`,
      solutionNotes: 'Сначала создайте все узлы, затем связи; сортировка не требуется.',
      hints: [
        'Два прохода устраняют зависимость от порядка родителей.',
      ],
      cases: [
        {
          name: 'Только корень',
          args: [
            [
              {
                id: 0,
                name: 'Каталог',
              },
            ],
          ],
          expected: {
            id: 0,
            name: 'Каталог',
            next: [],
          },
          hidden: false,
        },
        {
          name: 'Ребёнок раньше родителя',
          args: [
            [
              {
                id: 2,
                name: 'Пальто',
                parent: 1,
              },
              {
                id: 0,
                name: 'Товары',
              },
              {
                id: 1,
                name: 'Одежда',
                parent: 0,
              },
            ],
          ],
          expected: {
            id: 0,
            name: 'Товары',
            next: [
              {
                id: 1,
                name: 'Одежда',
                next: [
                  {
                    id: 2,
                    name: 'Пальто',
                    next: [],
                  },
                ],
              },
            ],
          },
          hidden: false,
        },
        {
          name: 'Порядок детей не числовой',
          args: [
            [
              {
                id: 9,
                name: 'Первый',
                parent: 0,
              },
              {
                id: 0,
                name: 'Корень',
              },
              {
                id: 1,
                name: 'Второй',
                parent: 0,
              },
            ],
          ],
          expected: {
            id: 0,
            name: 'Корень',
            next: [
              {
                id: 9,
                name: 'Первый',
                next: [],
              },
              {
                id: 1,
                name: 'Второй',
                next: [],
              },
            ],
          },
          hidden: false,
        },
        {
          name: 'Две ветви',
          args: [
            [
              {
                id: 0,
                name: 'R',
              },
              {
                id: 1,
                name: 'A',
                parent: 0,
              },
              {
                id: 4,
                name: 'D',
                parent: 1,
              },
              {
                id: 2,
                name: 'B',
                parent: 0,
              },
              {
                id: 3,
                name: 'C',
                parent: 2,
              },
            ],
          ],
          expected: {
            id: 0,
            name: 'R',
            next: [
              {
                id: 1,
                name: 'A',
                next: [
                  {
                    id: 4,
                    name: 'D',
                    next: [],
                  },
                ],
              },
              {
                id: 2,
                name: 'B',
                next: [
                  {
                    id: 3,
                    name: 'C',
                    next: [],
                  },
                ],
              },
            ],
          },
          hidden: true,
        },
        {
          name: 'Разреженные id',
          args: [
            [
              {
                id: 1000000000,
                name: 'Большой',
                parent: 0,
              },
              {
                id: 0,
                name: 'Ноль',
              },
            ],
          ],
          expected: {
            id: 0,
            name: 'Ноль',
            next: [
              {
                id: 1000000000,
                name: 'Большой',
                next: [],
              },
            ],
          },
          hidden: true,
        },
        {
          name: 'Одинаковые имена',
          args: [
            [
              {
                id: 0,
                name: 'x',
              },
              {
                id: 1,
                name: 'x',
                parent: 0,
              },
              {
                id: 2,
                name: 'x',
                parent: 0,
              },
            ],
          ],
          expected: {
            id: 0,
            name: 'x',
            next: [
              {
                id: 1,
                name: 'x',
                next: [],
              },
              {
                id: 2,
                name: 'x',
                next: [],
              },
            ],
          },
          hidden: true,
        },
        {
          name: 'Пустые и специальные имена',
          args: [
            [
              {
                id: 0,
                name: '',
              },
              {
                id: 7,
                name: '__proto__',
                parent: 0,
              },
            ],
          ],
          expected: {
            id: 0,
            name: '',
            next: [
              {
                id: 7,
                name: '__proto__',
                next: [],
              },
            ],
          },
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=[[{"id":0,"name":"Каталог"}]]
  const before=JSON.stringify(args)
  await categoryTree(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function categoryTree(categories) {
    const nodes = new Map();
    for (const category of categories)
        nodes.set(category.id, { id: category.id, name: category.name, next: [] });
    for (const category of categories) {
        if (category.id === 0)
            continue;
        const parent = nodes.get(category.parent ?? -1);
        const node = nodes.get(category.id);
        if (parent && node)
            parent.next.push(node);
    }
    const root = nodes.get(0);
    if (!root)
        throw new Error('root');
    return root;
}
`,
      starterCode: `function categoryTree(categories) {
    return { id: 0, name: '', next: [] };
}
`,
      companies: [
        'ozon',
      ],
    },
    {
      slug: 'interview-ozon-three-correct-queue',
      title: 'Route 256: разбиение событий на пары (адаптация)',
      difficulty: 'hard',
      entryName: 'canPairQueue',
      interviewFormat: 'algorithms',
      recommendedMinutes: 40,
      tags: [
        'queue',
        'greedy',
        'strings',
      ],
      sourceUrl: 'https://habr.com/ru/companies/ozontech/articles/833762/',
      companyEvidence: [
        {
          company: 'ozon',
          kind: 'official',
          url: 'https://habr.com/ru/companies/ozontech/articles/833762/',
          note: 'JS/TS-адаптация опубликованного отбора Route 256; не frontend live-coding, частота неизвестна.',
          checkedAt: '2026-10-10',
        },
      ],
      descriptionMd: 'Реализуйте canPairQueue(events): можно ли использовать все символы строки ровно один раз в парах AB, AC или BC. Первый символ пары обязан находиться раньше второго; пары могут пересекаться и не обязаны быть соседними. Допустимы только A/B/C, пустая строка даёт true. До100000 событий; требуется O(n). Наш boolean-контракт адаптирует опубликованную задачу отбора Route 256, а не frontend live-coding.',
      starterCodeTs: `function canPairQueue(events: string): boolean {
  return false
}`,
      solutionCodeTs: `function canPairQueue(events: string): boolean {
  let countA=0
  let countB=0
  let countC=0
  for(const character of events) {
    if(character==='A') countA++
    else if(character==='B') countB++
    else countC++
  }
  const ab=(countA+countB-countC)/2
  const ac=(countA+countC-countB)/2
  let bc=(countB+countC-countA)/2
  if(!Number.isInteger(ab)||ab<0||ac<0||bc<0) return false
  const aPositions:number[]=[]
  const bPositions:number[]=[]
  let bHead=0
  for(let index=0;index<events.length;index++) {
    const character=events[index]
    if(character==='A') aPositions.push(index)
    else if(character==='B') bPositions.push(index)
    else if(bc>0&&bHead<bPositions.length) {bHead++;bc--}
    else if(aPositions.length) aPositions.pop()
    else return false
  }
  if(bc!==0||aPositions.length!==bPositions.length-bHead) return false
  return aPositions.every((position,index)=>position<bPositions[bHead+index])
}`,
      solutionNotes: 'Определите количество каждого типа пары; C соединяйте с ранней B или поздней A.',
      hints: [
        'Сравните BABC и ABAC с наивным паросочетанием.',
      ],
      testCode: `__tr.register({name:'независимый matching oracle на коротких строках',hidden:true}, () => {
  function possible(text) {
    const memo=new Map()
    function search(mask) {
      if (!mask) return true
      if (memo.has(mask)) return memo.get(mask)
      let first=0
      while (!(mask & (1 << first))) first++
      for (let second=first+1;second<text.length;second++) {
        if (!(mask & (1 << second))) continue
        const pair=text[first]+text[second]
        if ((pair==='AB'||pair==='AC'||pair==='BC')&&search(mask^(1<<first)^(1<<second))) {memo.set(mask,true);return true}
      }
      memo.set(mask,false)
      return false
    }
    return search((1<<text.length)-1)
  }
  function visit(text,remaining) {
    expect(canPairQueue(text)).toBe(possible(text))
    if (remaining) for(const character of 'ABC') visit(text+character,remaining-1)
  }
  visit('',6)
})
__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=["ABCC"]
  const before=JSON.stringify(args)
  await canPairQueue(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      cases: [
        {
          name: 'Нужно отложить AB',
          args: [
            'ABCC',
          ],
          expected: true,
          hidden: false,
        },
        {
          name: 'Одна пара',
          args: [
            'AC',
          ],
          expected: true,
          hidden: false,
        },
        {
          name: 'Пустая очередь',
          args: [
            '',
          ],
          expected: true,
          hidden: false,
        },
        {
          name: 'Непарный символ',
          args: [
            'ABC',
          ],
          expected: false,
          hidden: true,
        },
        {
          name: 'C без предшественника',
          args: [
            'CABC',
          ],
          expected: false,
          hidden: true,
        },
        {
          name: 'Нужна ранняя B',
          args: [
            'BABC',
          ],
          expected: true,
          hidden: true,
        },
        {
          name: 'Нужна поздняя A',
          args: [
            'ABAC',
          ],
          expected: true,
          hidden: true,
        },
        {
          name: 'BC раньше последнего AB',
          args: [
            'ABCB',
          ],
          expected: true,
          hidden: true,
        },
      ],
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function canPairQueue(events) {
    let countA = 0;
    let countB = 0;
    let countC = 0;
    for (const character of events) {
        if (character === 'A')
            countA++;
        else if (character === 'B')
            countB++;
        else
            countC++;
    }
    const ab = (countA + countB - countC) / 2;
    const ac = (countA + countC - countB) / 2;
    let bc = (countB + countC - countA) / 2;
    if (!Number.isInteger(ab) || ab < 0 || ac < 0 || bc < 0)
        return false;
    const aPositions = [];
    const bPositions = [];
    let bHead = 0;
    for (let index = 0; index < events.length; index++) {
        const character = events[index];
        if (character === 'A')
            aPositions.push(index);
        else if (character === 'B')
            bPositions.push(index);
        else if (bc > 0 && bHead < bPositions.length) {
            bHead++;
            bc--;
        }
        else if (aPositions.length)
            aPositions.pop();
        else
            return false;
    }
    if (bc !== 0 || aPositions.length !== bPositions.length - bHead)
        return false;
    return aPositions.every((position, index) => position < bPositions[bHead + index]);
}
`,
      starterCode: `function canPairQueue(events) {
    return false;
}
`,
      companies: [
        'ozon',
      ],
    },
    {
      slug: 'interview-amazon-rle-codepoints',
      title: 'RLE по Unicode code points: адаптация Amazon demo',
      difficulty: 'easy',
      entryName: 'encodeRuns',
      interviewFormat: 'livecoding',
      recommendedMinutes: 20,
      tags: [
        'strings',
        'arrays',
      ],
      sourceUrl: 'https://www.amazon.jobs/content/en-gb/how-we-hire/interview-prep/software-development-topics',
      companyEvidence: [
        {
          company: 'amazon',
          kind: 'official',
          url: 'https://cdn.cms.amazon.jobs/46/56/87e44d2d4347a200acf9f50b023f/amazon-coding-sample-transcript.docx',
          note: 'Учебная адаптация официального coding demo; формат наш, частота неизвестна.',
          checkedAt: '2026-10-10',
        },
      ],
      descriptionMd: 'Реализуйте encodeRuns(text): замените каждую серию одинаковых соседних Unicode code points парой [character,count] и верните массив пар. Пустая строка даёт[]. Цифры и пробелы — обычные символы. Считайте code points, как for...of, а не UTF-16 единицы или пользовательские графемы; нормализацию не выполняйте. До100000 code points. Например "яя😀😀3" → [["я",2],["😀",2],["3",1]]. Это адаптация официального Amazon coding demo с нашим однозначным JSON-форматом, не обещание вопроса на будущем интервью.',
      starterCodeTs: `function encodeRuns(text: string): Array<[string,number]> {
  return []
}`,
      solutionCodeTs: `function encodeRuns(text: string): Array<[string,number]> {
  const result:Array<[string,number]>=[]
  for(const character of text) {
    const previous=result[result.length-1]
    if(previous&&previous[0]===character) previous[1]++
    else result.push([character,1])
  }
  return result
}`,
      solutionNotes: 'Серия заканчивается при смене code point; несоседние повторения не объединяются.',
      hints: [
        'for...of корректно обрабатывает символы за пределами BMP.',
      ],
      cases: [
        {
          name: 'Unicode и цифра',
          args: [
            'яя😀😀3',
          ],
          expected: [
            [
              'я',
              2,
            ],
            [
              '😀',
              2,
            ],
            [
              '3',
              1,
            ],
          ],
          hidden: false,
        },
        {
          name: 'Пустой текст',
          args: [
            '',
          ],
          expected: [],
          hidden: false,
        },
        {
          name: 'Одна серия',
          args: [
            'zzzz',
          ],
          expected: [
            [
              'z',
              4,
            ],
          ],
          hidden: false,
        },
        {
          name: 'Возврат к символу',
          args: [
            'aba',
          ],
          expected: [
            [
              'a',
              1,
            ],
            [
              'b',
              1,
            ],
            [
              'a',
              1,
            ],
          ],
          hidden: true,
        },
        {
          name: 'Пробелы и перевод строки',
          args: ['  \n\n '],
          expected: [
            [
              ' ',
              2,
            ],
            [
              `
`,
              2,
            ],
            [
              ' ',
              1,
            ],
          ],
          hidden: true,
        },
        {
          name: 'Цифры не являются счётчиками',
          args: [
            '11122',
          ],
          expected: [
            [
              '1',
              3,
            ],
            [
              '2',
              2,
            ],
          ],
          hidden: true,
        },
        {
          name: 'Комбинируемые знаки',
          args: [
            'éé',
          ],
          expected: [
            [
              'e',
              1,
            ],
            [
              '́',
              1,
            ],
            [
              'e',
              1,
            ],
            [
              '́',
              1,
            ],
          ],
          hidden: true,
        },
        {
          name: 'Разный регистр',
          args: [
            'AAa',
          ],
          expected: [
            [
              'A',
              2,
            ],
            [
              'a',
              1,
            ],
          ],
          hidden: true,
        },
      ],
      testCode: `__tr.register({name:'исходные аргументы не меняются',hidden:true}, async () => {
  const args=["яя😀😀3"]
  const before=JSON.stringify(args)
  await encodeRuns(...args)
  expect(JSON.stringify(args)).toBe(before)
})`,
      checkMode: 'unit',
      languages: [
        'js',
        'ts',
      ],
      solutionCode: `function encodeRuns(text) {
    const result = [];
    for (const character of text) {
        const previous = result[result.length - 1];
        if (previous && previous[0] === character)
            previous[1]++;
        else
            result.push([character, 1]);
    }
    return result;
}
`,
      starterCode: `function encodeRuns(text) {
    return [];
}
`,
      companies: [
        'amazon',
      ],
    },
  ],
}
