import type { TrainerTaskSeed, TrainerTopicSeed } from './types'

function goTask(task: Omit<TrainerTaskSeed, 'languages' | 'checkMode' | 'starterCode' | 'solutionCode'> & {
  starterCodeGo: string
  solutionCodeGo: string
}): TrainerTaskSeed {
  return {
    ...task,
    languages: ['go'],
    checkMode: 'program',
    starterCode: task.starterCodeGo,
    solutionCode: task.solutionCodeGo,
  }
}

export const goTopic: TrainerTopicSeed = {
  slug: 'go-programming',
  title: 'Go: программы и данные',
  description: 'Программы на Go с чтением JSON из stdin и проверкой stdout',
  category: 'go',
  icon: '🐹',
  order: 19,
  tasks: [
    goTask({
      slug: 'go-sum-json',
      title: 'Сумма чисел из JSON',
      difficulty: 'easy',
      descriptionMd: `Напишите полноценную программу на Go в файле main.go: package main и функция main.

Программа читает из стандартного ввода (stdin) один JSON-массив целых чисел и печатает в стандартный вывод (stdout) их сумму. Для пустого массива напечатайте 0. Отрицательные числа допускаются. Числа и их сумма помещаются в int64; вход всегда корректный.

Пример: для входа [4, -2, 7] вывод должен быть 9. Выведите только ответ; завершающий перевод строки разрешён. Подсказки и отладочные сообщения не добавляйте в stdout.

Кнопка «Запустить» компилирует программу и подаёт каждый открытый пример в stdin отдельным запуском. Для своей проверки укажите текст входа, например [], и ожидаемый stdout: 0. «Отправить» дополнительно запускает скрытые примеры на сервере. Внешние пакеты и доступ к сети не требуются.`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и вычислите сумму.
  fmt.Println(0)
}`,
      solutionCodeGo: `package main

import (
  "encoding/json"
  "fmt"
  "os"
)

func main() {
  var numbers []int64
  if err := json.NewDecoder(os.Stdin).Decode(&numbers); err != nil {
    return
  }
  var sum int64
  for _, number := range numbers {
    sum += number
  }
  fmt.Println(sum)
}`,
      solutionNotes: 'json.Decoder читает stdin без ручного разбора строк. Суммируйте в int64, чтобы пример с числами больше 32 бит не переполнился.',
      hints: ['Используйте json.NewDecoder(os.Stdin).Decode(&numbers).', 'Для накопления суммы подойдёт переменная типа int64 и цикл range.'],
      runtimeCases: [
        { name: 'Положительные и отрицательные', hidden: false, input: '[4,-2,7]', expected: '9' },
        { name: 'Пустой массив', hidden: false, input: '[]', expected: '0' },
        { name: 'Один элемент', hidden: false, input: '[12]', expected: '12' },
        { name: 'Все отрицательные', hidden: true, input: '[-8,-3,-1]', expected: '-12' },
        { name: 'Значения больше int32', hidden: true, input: '[4000000000,3000000000,-2]', expected: '6999999998' },
        { name: 'Пробелы и переносы строк', hidden: true, input: ' [\n 5,\n 0,\n -5\n ]\n', expected: '0' },
        { name: 'Повторяющиеся числа', hidden: true, input: '[3,3,3,3]', expected: '12' },
      ],
    }),
    goTask({
      slug: 'go-unique-sorted',
      title: 'Уникальные числа по возрастанию',
      difficulty: 'easy',
      descriptionMd: `Напишите программу на Go (package main, функция main), которая читает из stdin JSON-массив целых чисел, удаляет повторения и печатает JSON-массив уникальных чисел по возрастанию.

Пример: [3, 1, 3, -2, 1] → [-2,1,3]. Пустой входной массив даёт [], а не null. Числа помещаются в int64. Вход всегда корректный, в нём не больше 10 000 элементов.

Для stdout используйте компактный JSON без пробелов, например json.NewEncoder(os.Stdout).Encode(result). Завершающий перевод строки разрешён. Порядок ключей map не должен определять порядок ответа.

«Запустить» проверяет открытые примеры в отдельных запусках программы. В собственную проверку можно добавить stdin [2,2,2] и ожидаемый stdout [2]. «Отправить» проверяет также скрытые наборы на сервере. Нужна только стандартная библиотека Go.`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте числа, удалите повторы и отсортируйте результат.
  fmt.Println("[]")
}`,
      solutionCodeGo: `package main

import (
  "encoding/json"
  "os"
  "sort"
)

func main() {
  var numbers []int64
  if err := json.NewDecoder(os.Stdin).Decode(&numbers); err != nil {
    return
  }
  seen := make(map[int64]bool)
  result := make([]int64, 0, len(numbers))
  for _, number := range numbers {
    if !seen[number] {
      seen[number] = true
      result = append(result, number)
    }
  }
  sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
  json.NewEncoder(os.Stdout).Encode(result)
}`,
      solutionNotes: 'map помогает удалить повторения, сортировка задаёт стабильный порядок. Создайте непустой по значению, но нулевой по длине slice через make: nil сериализуется как null.',
      hints: ['Храните уже встреченные числа в map[int64]bool.', 'Сортируйте slice с помощью sort.Slice. Для пустого JSON-массива создайте result через make.'],
      runtimeCases: [
        { name: 'Повторы и отрицательное число', hidden: false, input: '[3,1,3,-2,1]', expected: '[-2,1,3]' },
        { name: 'Пустой массив', hidden: false, input: '[]', expected: '[]' },
        { name: 'Один элемент', hidden: false, input: '[7]', expected: '[7]' },
        { name: 'Все числа одинаковы', hidden: true, input: '[2,2,2,2]', expected: '[2]' },
        { name: 'Обратный порядок', hidden: true, input: '[5,4,3,2,1]', expected: '[1,2,3,4,5]' },
        { name: 'Нули и отрицательные', hidden: true, input: '[0,-3,0,-1,-3]', expected: '[-3,-1,0]' },
        { name: 'Значения больше int32', hidden: true, input: '[4000000000,-4000000000,4000000000]', expected: '[-4000000000,4000000000]' },
      ],
    }),
  ],
}
