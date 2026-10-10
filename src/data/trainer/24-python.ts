import type { RuntimeCase } from '@/lib/trainer/runtime-spec'
import type { TrainerTaskSeed, TrainerTopicSeed } from './types'

const programContract = `Напишите полноценную программу на Python 3.13 в main.py. Прочитайте один JSON из stdin через json.load(sys.stdin) и выведите только ответ: компактный JSON без пробелов, например print(json.dumps(result, ensure_ascii=False, separators=(',', ':'))). Завершающий перевод строки разрешён. Вход корректный; установка пакетов, файлы и сеть не нужны, достаточно стандартной библиотеки.

«Запустить» проверяет открытые примеры отдельными запусками программы. В собственный тест вводите весь JSON как stdin и компактный JSON ответа как ожидаемый stdout. «Отправить» дополнительно проверяет скрытые примеры на сервере.`

const starter = `import json
import sys


def solve(data):
    # Реализуйте алгоритм по условию задачи.
    return None


def main():
    data = json.load(sys.stdin)
    print(json.dumps(solve(data), ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    main()
`

function program(implementation: string): string {
  return `import json\nimport sys\n\n\n${implementation}\n\n\ndef main():\n    data = json.load(sys.stdin)\n    print(json.dumps(solve(data), ensure_ascii=False, separators=(',', ':')))\n\n\nif __name__ == '__main__':\n    main()\n`
}

function example(name: string, input: unknown, expected: unknown, hidden = false): RuntimeCase {
  return { name, input: JSON.stringify(input), expected: JSON.stringify(expected), hidden }
}

function pythonTask(task: Omit<TrainerTaskSeed, 'languages' | 'checkMode' | 'starterCode' | 'solutionCode' | 'starterCodePython'> & {
  solutionCodePython: string
}): TrainerTaskSeed {
  return {
    ...task,
    languages: ['python'],
    checkMode: 'program',
    interviewFormat: 'algorithms',
    companies: [],
    companyEvidence: [],
    starterCode: starter,
    starterCodePython: starter,
    solutionCode: task.solutionCodePython,
    descriptionMd: `${task.descriptionMd}\n\n${programContract}`,
    timeLimitMs: 2000,
  }
}

export const pythonTopic: TrainerTopicSeed = {
  slug: 'python-programming',
  title: 'Python: алгоритмы для собеседования',
  description: 'Алгоритмы на Python с JSON-вводом, Unicode, детерминированным ответом и проверкой крайних случаев',
  category: 'python',
  icon: '🐍',
  order: 24,
  tasks: [
    pythonTask({
      slug: 'python-two-sum-json',
      title: 'Два числа с заданной суммой',
      difficulty: 'easy',
      recommendedMinutes: 20,
      leetcodeNumber: 1,
      sourceUrl: 'https://leetcode.com/problems/two-sum/description/',
      tags: ['python', 'algorithms', 'arrays', 'hash-table', 'leetcode'],
      descriptionMd: `На вход поступает объект {"nums":[8,2,5,1],"target":7}. Найдите два разных индекса i < j, для которых nums[i] + nums[j] = target, и выведите [i,j]. Если пары нет, выведите [].

Ответ должен быть однозначным: сначала выбирайте минимальный правый индекс j, а среди подходящих пар с этим j — минимальный левый индекс i. Каждый элемент можно использовать только один раз. Для приведённого входа ответ [1,2].

Массив содержит от 0 до 10 000 целых чисел в диапазоне от −10⁹ до 10⁹; target в том же диапазоне. Попробуйте пройти массив один раз, сохраняя ранее встреченные значения.

Это самостоятельная вариация LeetCode №1: здесь допускается отсутствие пары и явно задан порядок выбора при нескольких ответах.`,
      hints: ['Для текущего числа ищите ранее встреченное target − number.', 'Запоминайте первый индекс числа. Проверяйте пару до добавления текущего элемента.'],
      solutionNotes: 'Словарь хранит первый индекс каждого числа. Проход слева направо выбирает минимальный j, а сохранение первого индекса — минимальный i. Ожидаемое время O(n), память O(n).',
      solutionCodePython: program(`def solve(data):
    first_index = {}
    target = data['target']
    for right, number in enumerate(data['nums']):
        complement = target - number
        if complement in first_index:
            return [first_index[complement], right]
        if number not in first_index:
            first_index[number] = right
    return []`),
      runtimeCases: [
        example('Пара в середине', { nums: [8, 2, 5, 1], target: 7 }, [1, 2]),
        example('Одинаковые числа', { nums: [4, 4], target: 8 }, [0, 1]),
        example('Пары нет', { nums: [2, 6], target: 9 }, []),
        example('Пустой массив', { nums: [], target: 0 }, [], true),
        example('Один элемент не используется дважды', { nums: [3], target: 6 }, [], true),
        example('Минимальный правый индекс', { nums: [1, 4, 2, 3], target: 5 }, [0, 1], true),
        example('Первое вхождение левого числа', { nums: [2, 2, 7], target: 9 }, [0, 2], true),
        example('Нули и отрицательные числа', { nums: [-5, 0, 5, 0], target: 0 }, [0, 2], true),
        example('Границы диапазона', { nums: [-1000000000, 1000000000], target: 0 }, [0, 1], true),
      ],
    }),
    pythonTask({
      slug: 'python-longest-unique-substring',
      title: 'Самая длинная подстрока без повторов',
      difficulty: 'medium',
      recommendedMinutes: 25,
      leetcodeNumber: 3,
      sourceUrl: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/description/',
      tags: ['python', 'algorithms', 'strings', 'sliding-window', 'hash-table', 'leetcode'],
      descriptionMd: `Вход — одна JSON-строка. Выведите длину самой длинной непрерывной подстроки, в которой нет повторяющихся символов. Например, для "abcaef" ответ 5: подходит "bcaef". Для пустой строки ответ 0.

Символ — Unicode code point, как при обычном переборе строки в Python. Пробелы, регистр и знаки пунктуации значимы; нормализацию Unicode не выполняйте. Комбинируемый знак и буква — отдельные code points, emoji тоже учитывается как один code point, если состоит из одного такого значения.

Длина входа не превышает 10 000 code points. Требуется O(n) по времени: левую границу окна нельзя возвращать назад.

Это самостоятельная Unicode-вариация LeetCode №3.`,
      hints: ['Храните индекс последнего появления каждого символа.', 'При повторе передвиньте левую границу до max(left, last_index + 1).'],
      solutionNotes: 'Индексы Python относятся к code points. Словарь последних позиций и монотонная левая граница дают время O(n) и память O(u), где u — число разных символов.',
      solutionCodePython: program(`def solve(text):
    last_index = {}
    left = 0
    longest = 0
    for right, character in enumerate(text):
        if character in last_index:
            left = max(left, last_index[character] + 1)
        last_index[character] = right
        longest = max(longest, right - left + 1)
    return longest`),
      runtimeCases: [
        example('Окно после повтора', 'abcaef', 5),
        example('Пустая строка', '', 0),
        example('Emoji и кириллица', '🐍а🐍бв', 4),
        example('Все символы одинаковы', 'яяяя', 1, true),
        example('Левая граница не отступает', 'abba', 2, true),
        example('Пробелы учитываются', 'a b a', 3, true),
        example('Регистр значим', 'AaАа', 4, true),
        example('Без нормализации Unicode', 'é' + 'e\u0301', 3, true),
        example('Длинная строка с повтором', 'abcd'.repeat(1500), 4, true),
      ],
    }),
    pythonTask({
      slug: 'python-merge-intervals',
      title: 'Объединить пересекающиеся интервалы',
      difficulty: 'medium',
      recommendedMinutes: 25,
      leetcodeNumber: 56,
      sourceUrl: 'https://leetcode.com/problems/merge-intervals/description/',
      tags: ['python', 'algorithms', 'arrays', 'sorting', 'leetcode'],
      descriptionMd: `Вход — JSON-массив закрытых интервалов [start,end], где start ≤ end. Объедините все пересекающиеся интервалы и выведите итоговый массив по возрастанию начала. Касание в одной точке считается пересечением: [1,3] и [3,6] превращаются в [1,6].

Например, [[6,9],[1,4],[2,5],[12,12]] → [[1,5],[6,9],[12,12]]. Для пустого массива выведите []. Интервалы могут быть не отсортированы и повторяться, координаты целые от −10⁹ до 10⁹. Не более 10 000 интервалов.

Целевое время O(n log n). Это самостоятельная вариация LeetCode №56 с пустым входом и отрицательными координатами.`,
      hints: ['Сначала отсортируйте интервалы по start, затем по end.', 'Сравнивайте начало очередного интервала с концом последнего интервала результата.'],
      solutionNotes: 'После сортировки достаточно линейного прохода. При пересечении расширяйте конец через max, чтобы вложенный интервал не уменьшил уже покрытый участок. Время O(n log n), память результата O(n).',
      solutionCodePython: program(`def solve(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged`),
      runtimeCases: [
        example('Неотсортированный вход', [[6, 9], [1, 4], [2, 5], [12, 12]], [[1, 5], [6, 9], [12, 12]]),
        example('Касание концов', [[1, 3], [3, 6]], [[1, 6]]),
        example('Пустой массив', [], []),
        example('Вложенные интервалы', [[1, 10], [2, 3], [4, 8]], [[1, 10]], true),
        example('Повторяющиеся интервалы', [[2, 5], [2, 5]], [[2, 5]], true),
        example('Отрицательные координаты', [[-8, -3], [-4, 0], [2, 4]], [[-8, 0], [2, 4]], true),
        example('Точечные интервалы', [[4, 4], [1, 1], [4, 4]], [[1, 1], [4, 4]], true),
        example('Цепочка пересечений', [[8, 11], [3, 8], [-2, 3]], [[-2, 11]], true),
      ],
    }),
    pythonTask({
      slug: 'python-top-k-frequent',
      title: 'Самые частые числа с устойчивым порядком',
      difficulty: 'medium',
      recommendedMinutes: 25,
      leetcodeNumber: 347,
      sourceUrl: 'https://leetcode.com/problems/top-k-frequent-elements/description/',
      tags: ['python', 'algorithms', 'arrays', 'hash-table', 'sorting', 'leetcode'],
      descriptionMd: `Прочитайте объект {"nums":[4,4,2,2,7],"k":2}. Выведите k различных чисел, встречающихся чаще остальных. Сначала идут числа с большей частотой; при одинаковой частоте меньшее число должно идти раньше. Для примера ответ [2,4].

Числа целые от −10⁹ до 10⁹, в nums не более 10 000 элементов. k — целое от 0 до количества различных чисел. При k = 0 выведите [], в том числе для пустого входного массива. Частоты считайте точно, без преобразования чисел в строки.

Допускается время O(n + u log u), где u — число различных значений. Это самостоятельная вариация LeetCode №347: здесь фиксирован порядок ответа и допускается k = 0.`,
      hints: ['Counter из collections считает частоты.', 'Ключ сортировки — пара (-frequency, number), а не строковое представление числа.'],
      solutionNotes: 'Counter строится за O(n); сортируем u ключей по убыванию частоты и по возрастанию числового значения. Срез [:k] сохраняет заданный порядок. Время O(n + u log u), память O(u).',
      solutionCodePython: program(`from collections import Counter


def solve(data):
    frequencies = Counter(data['nums'])
    ordered = sorted(frequencies, key=lambda number: (-frequencies[number], number))
    return ordered[:data['k']]`),
      runtimeCases: [
        example('Равные частоты', { nums: [4, 4, 2, 2, 7], k: 2 }, [2, 4]),
        example('Приоритет частоты', { nums: [9, 9, 9, -1, -1, 3], k: 2 }, [9, -1]),
        example('Пустой массив и k = 0', { nums: [], k: 0 }, []),
        example('Нулевой размер ответа', { nums: [1, 1, 2], k: 0 }, [], true),
        example('Числовой порядок при равенстве', { nums: [10, 2, -3, 0], k: 4 }, [-3, 0, 2, 10], true),
        example('Граница среза среди равных', { nums: [8, 8, 6, 6, 4, 4], k: 2 }, [4, 6], true),
        example('Один различный элемент', { nums: [5, 5, 5, 5], k: 1 }, [5], true),
        example('Отрицательные числа и нули', { nums: [-2, -2, 0, 0, 0, -1], k: 3 }, [0, -2, -1], true),
      ],
    }),
    pythonTask({
      slug: 'python-number-of-islands',
      title: 'Острова: итеративный обход сетки',
      difficulty: 'medium',
      recommendedMinutes: 35,
      leetcodeNumber: 200,
      sourceUrl: 'https://leetcode.com/problems/number-of-islands/description/',
      tags: ['python', 'algorithms', 'graph', 'queue', 'arrays', 'leetcode'],
      descriptionMd: `Вход — прямоугольный JSON-массив строк одинаковой длины, например ["1100","0101","0001"]. Каждый символ — "1" (суша) или "0" (вода). Выведите число отдельных островов. Соседство считается только по общей стороне: вверх, вниз, влево и вправо. Для примера ответ 2.

Пустая сетка [] и сетка из пустых строк дают 0. В сетке не более 10 000 клеток. Используйте итеративный BFS с очередью или DFS со стеком: длинный остров не должен зависеть от лимита рекурсии Python. Каждую клетку обрабатывайте не более постоянного числа раз, целевое время O(rows × columns).

Это самостоятельная вариация LeetCode №200 с JSON-массивом строк и проверкой длинных связных участков.`,
      hints: ['При обнаружении новой суши увеличьте счётчик и обойдите всю её компоненту.', 'Помечайте клетку посещённой при добавлении в очередь, а не при извлечении.'],
      solutionNotes: 'deque обеспечивает O(1) для popleft. Суша превращается в воду уже при постановке в очередь, поэтому одну клетку не добавят дважды. Итеративный обход не переполняет стек рекурсии. Время и дополнительная память O(rows × columns).',
      solutionCodePython: program(`from collections import deque


def solve(rows):
    if not rows or not rows[0]:
        return 0
    grid = [list(row) for row in rows]
    height, width = len(grid), len(grid[0])
    islands = 0
    for row in range(height):
        for column in range(width):
            if grid[row][column] != '1':
                continue
            islands += 1
            grid[row][column] = '0'
            queue = deque([(row, column)])
            while queue:
                current_row, current_column = queue.popleft()
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nr, nc = current_row + dr, current_column + dc
                    if 0 <= nr < height and 0 <= nc < width and grid[nr][nc] == '1':
                        grid[nr][nc] = '0'
                        queue.append((nr, nc))
    return islands`),
      runtimeCases: [
        example('Два острова', ['1100', '0101', '0001'], 2),
        example('Пустая сетка', [], 0),
        example('Диагонали не соединяют сушу', ['10', '01'], 2),
        example('Нулевая ширина', ['', ''], 0, true),
        example('Только вода', ['000', '000'], 0, true),
        example('Один остров с отверстием', ['111', '101', '111'], 1, true),
        example('Чередующиеся клетки', ['101', '010', '101'], 5, true),
        example('Длинный остров без рекурсии', ['1'.repeat(6000)], 1, true),
        example('Одна колонка с разрывами', ['1', '0', '1', '1', '0', '1'], 3, true),
      ],
    }),
    pythonTask({
      slug: 'python-group-anagrams',
      title: 'Анаграммы Unicode со стабильным порядком',
      difficulty: 'medium',
      recommendedMinutes: 25,
      leetcodeNumber: 49,
      sourceUrl: 'https://leetcode.com/problems/group-anagrams/description/',
      tags: ['python', 'algorithms', 'strings', 'hash-table', 'sorting', 'leetcode'],
      descriptionMd: `Вход — JSON-массив строк. Объедините в группы строки с одинаковым набором Unicode code points и количеством каждого из них. Например, ["кот","ток","дом","мод","кот"] → [["кот","ток","кот"],["дом","мод"]].

Порядок групп определяется первым появлением строки из соответствующей группы во входе. Внутри группы сохраните исходный порядок, включая повторяющиеся строки. Для пустого массива ответ []. Пустые строки образуют одну группу. Регистр значим; нормализацию Unicode не выполняйте.

Вход содержит не более 10 000 строк и не более 10 000 code points суммарно. Символы Python сравниваются как code points, поэтому emoji и кириллица не требуют отдельной обработки.

Это самостоятельная вариация LeetCode №49: поддерживается Unicode и фиксирован порядок групп и их содержимого.`,
      hints: ['Отсортированные символы строки можно превратить в tuple — ключ словаря.', 'dict в Python сохраняет порядок вставки ключей. При совпадении ключа добавляйте слово в существующую группу.'],
      solutionNotes: 'Ключ tuple(sorted(word)) содержит символы вместе с их повторениями. Порядок dict сохраняет порядок первого появления группы, append сохраняет порядок слов. Время O(Σ length × log length), дополнительная память O(Σ length).',
      solutionCodePython: program(`def solve(words):
    groups = {}
    for word in words:
        key = tuple(sorted(word))
        if key not in groups:
            groups[key] = []
        groups[key].append(word)
    return list(groups.values())`),
      runtimeCases: [
        example('Кириллица и повторы', ['кот', 'ток', 'дом', 'мод', 'кот'], [['кот', 'ток', 'кот'], ['дом', 'мод']]),
        example('Пустой массив', [], []),
        example('Пустые строки', ['', 'a', ''], [['', ''], ['a']]),
        example('Количество символов значимо', ['aab', 'ab', 'aba', 'ba'], [['aab', 'aba'], ['ab', 'ba']], true),
        example('Регистр значим', ['Aa', 'aA', 'aa', 'AA'], [['Aa', 'aA'], ['aa'], ['AA']], true),
        example('Emoji', ['🐍а', 'а🐍', '🐍🐍', '🙂'], [['🐍а', 'а🐍'], ['🐍🐍'], ['🙂']], true),
        example('Без нормализации', ['é', 'e\u0301', '\u0301e'], [['é'], ['e\u0301', '\u0301e']], true),
        example('Порядок первого появления группы', ['ba', 'x', 'ab', 'y', 'x'], [['ba', 'ab'], ['x', 'x'], ['y']], true),
      ],
    }),
    pythonTask({
      slug: 'python-valid-brackets',
      title: 'Правильная последовательность скобок',
      difficulty: 'easy',
      recommendedMinutes: 20,
      leetcodeNumber: 20,
      sourceUrl: 'https://leetcode.com/problems/valid-parentheses/description/',
      tags: ['python', 'algorithms', 'strings', 'stack', 'leetcode'],
      descriptionMd: `Вход — JSON-строка, содержащая только (), [] и {}. Проверьте, можно ли сопоставить каждой открывающей скобке закрывающую того же типа, сохранив правильную вложенность. Выведите JSON-boolean true или false.

Например, "{[()]}[]" даёт true, а "([)]" — false. Пустая строка считается правильной. Отдельная закрывающая скобка и незакрытый остаток делают последовательность неправильной. Длина — не более 10 000 символов. Целевое время O(n).

Это самостоятельная вариация LeetCode №20 с явным поведением на пустой строке. Выводите JSON-boolean в нижнем регистре через json.dumps, а не строку "True" или "False".`,
      hints: ['Для открывающих скобок используйте list как стек.', 'Закрывающая скобка должна соответствовать последней открытой. После прохода стек должен быть пустым.'],
      solutionNotes: 'Каждая скобка добавляется в стек или удаляет его вершину. Несовпадение и пустой стек при закрытии обнаруживаются сразу. Время O(n), память O(n) для глубоко вложенной последовательности.',
      solutionCodePython: program(`def solve(text):
    matching = {')': '(', ']': '[', '}': '{'}
    stack = []
    for bracket in text:
        if bracket in '([{':
            stack.append(bracket)
        elif not stack or stack.pop() != matching[bracket]:
            return False
    return not stack`),
      runtimeCases: [
        example('Вложенность и соседние пары', '{[()]}[]', true),
        example('Неправильный порядок', '([)]', false),
        example('Пустая строка', '', true),
        example('Закрывающая без открывающей', ')', false, true),
        example('Незакрытый остаток', '([]', false, true),
        example('Разные типы пары', '(]', false, true),
        example('Повторяющиеся соседние пары', '()[]{}'.repeat(1000), true, true),
        example('Глубокая вложенность', '('.repeat(3000) + ')'.repeat(3000), true, true),
        example('Открывающая после корректной пары', '(){', false, true),
      ],
    }),
    pythonTask({
      slug: 'python-subarray-sum',
      title: 'Сколько подмассивов дают заданную сумму',
      difficulty: 'medium',
      recommendedMinutes: 30,
      leetcodeNumber: 560,
      sourceUrl: 'https://leetcode.com/problems/subarray-sum-equals-k/description/',
      tags: ['python', 'algorithms', 'arrays', 'hash-table', 'leetcode'],
      descriptionMd: `Прочитайте объект {"nums":[2,-1,2,-1],"k":1}. Посчитайте все непустые непрерывные подмассивы, сумма элементов которых равна k, и выведите целое число. Для примера ответ 3. Подмассивы с разными началом или концом считаются разными, даже если содержат одинаковые числа.

nums содержит от 0 до 10 000 целых чисел, каждый элемент и k находятся в диапазоне от −10⁹ до 10⁹. Отрицательные числа и нули разрешены. Для пустого nums ответ 0, даже при k = 0. Сумму и количество ответов считайте точно как int.

Требуется O(n) по времени. Обычное скользящее окно для положительных чисел здесь не подходит: отрицательные значения меняют сумму в обе стороны. Это самостоятельная вариация LeetCode №560 с явным пустым входом.`,
      hints: ['Сумма участка равна разности двух префиксных сумм.', 'Храните количество предыдущих префиксов. Начальный префикс 0 встречается один раз.'],
      solutionNotes: 'Для текущей префиксной суммы prefix нужен ранее встреченный prefix − k. Сначала прибавьте число таких префиксов к ответу, затем зарегистрируйте текущий prefix: иначе при k = 0 будет учтён пустой участок. Ожидаемое время O(n), память O(n).',
      solutionCodePython: program(`def solve(data):
    frequencies = {0: 1}
    prefix = 0
    total = 0
    for number in data['nums']:
        prefix += number
        total += frequencies.get(prefix - data['k'], 0)
        frequencies[prefix] = frequencies.get(prefix, 0) + 1
    return total`),
      runtimeCases: [
        example('Отрицательные значения', { nums: [2, -1, 2, -1], k: 1 }, 3),
        example('Несколько одинаковых участков', { nums: [1, 1, 1], k: 2 }, 2),
        example('Пустой массив', { nums: [], k: 0 }, 0),
        example('Все нули', { nums: [0, 0, 0], k: 0 }, 6, true),
        example('Непустые участки с нулевой суммой', { nums: [1, -1, 1, -1], k: 0 }, 4, true),
        example('Отрицательная целевая сумма', { nums: [-1, -1, 1], k: -1 }, 3, true),
        example('Ответов нет', { nums: [2, 4, 6], k: 3 }, 0, true),
        example('Большие префиксные суммы', { nums: [1000000000, 1000000000, -1000000000], k: 1000000000 }, 3, true),
        example('Количество больше длины массива', { nums: Array.from({ length: 1500 }, () => 0), k: 0 }, 1125750, true),
      ],
    }),
    {
      ...pythonTask({
        slug: 'python-run-length-encoding',
        title: 'Серии символов: run-length encoding',
        difficulty: 'easy',
        recommendedMinutes: 20,
        sourceUrl: 'https://www.amazon.jobs/content/en-gb/how-we-hire/interview-prep/software-development-topics',
        tags: ['python', 'algorithms', 'strings', 'arrays'],
        descriptionMd: `Прочитайте одну JSON-строку и разбейте её на максимальные непрерывные серии одинаковых символов. Выведите JSON-массив пар [символ,число_повторений], сохранив порядок серий.

Например, "mmnnnm" → [["m",2],["n",3],["m",1]]. Две серии одного символа, разделённые другими символами, остаются отдельными: считать общую частоту символов нельзя. Пустая строка даёт []. Для строки из одного символа результат содержит одну пару с количеством 1.

Символ — Unicode code point, как при обычном переборе строки Python. Регистр и пробелы значимы; нормализацию Unicode не выполняйте. Длина не превышает 2000 code points. Число повторений — положительное целое число. Целевое время O(n), память O(r), где r — число серий.

Задача адаптирует run-length encoding из официального Amazon Coding Sample. Здесь самостоятельно определены JSON-ввод, формат ответа парами и работа с Unicode; примеры и эталон написаны для тренажёра. Официальный источник подтверждает учебное coding demo, а не частоту появления задачи на интервью.`,
        hints: ['При отличии символа от последнего завершите текущую серию и начните новую.', 'Не забудьте сохранить последнюю серию. Можно сразу менять счётчик последней пары результата.'],
        solutionNotes: 'Последняя пара хранит текущую непрерывную серию. Совпадение увеличивает её счётчик, различие добавляет новую пару. Один проход по code points даёт O(n) времени и O(r) памяти; пустая строка естественно возвращает пустой массив.',
        solutionCodePython: program(`def solve(text):
    runs = []
    for character in text:
        if runs and runs[-1][0] == character:
            runs[-1][1] += 1
        else:
            runs.append([character, 1])
    return runs`),
        wrongSolution: program(`from collections import Counter


def solve(text):
    return [[character, count] for character, count in Counter(text).items()]`),
        runtimeCases: [
          example('Повторная серия того же символа', 'mmnnnm', [['m', 2], ['n', 3], ['m', 1]]),
          example('Пустая строка', '', []),
          example('Emoji и кириллица', '🐍🐍яя🐍', [['🐍', 2], ['я', 2], ['🐍', 1]]),
          example('Один символ', 'x', [['x', 1]], true),
          example('Цифры и пунктуация', '11::1', [['1', 2], [':', 2], ['1', 1]], true),
          example('Комбинируемые знаки отдельно', 'e\u0301e\u0301', [['e', 1], ['\u0301', 1], ['e', 1], ['\u0301', 1]], true),
          example('Максимальная длина одной серии', 'я'.repeat(2000), [['я', 2000]], true),
          example('Много коротких серий', 'аб'.repeat(500), Array.from({ length: 1000 }, (_, index) => [index % 2 === 0 ? 'а' : 'б', 1]), true),
        ],
      }),
      companies: ['amazon'],
      companyEvidence: [{
        company: 'amazon',
        kind: 'official',
        url: 'https://www.amazon.jobs/content/en-gb/how-we-hire/interview-prep/software-development-topics',
        note: 'Адаптация официального coding demo Amazon Coding Sample; формат JSON тренажёра. Частота появления на интервью не подтверждена.',
        checkedAt: '2026-10-10',
      }],
    },
  ],
}
