import type { TrainerTopicSeed } from './types'

export const goInterviewTopic: TrainerTopicSeed = {
  slug: 'go-interview-practice',
  title: 'Go: практика собеседований',
  description: 'Работа с map и slice, каналы, bounded concurrency и отмена через context',
  category: 'go',
  icon: '🐹',
  order: 22,
  tasks: [
    {
      slug: 'interview-go-stable-string-dedupe',
      title: 'Go: дедупликация строк с сохранением порядка',
      difficulty: 'easy',
      interviewFormat: 'language',
      recommendedMinutes: 15,
      tags: [
        'go',
        'hash-table',
        'arrays',
      ],
      sourceUrl: 'https://go.dev/blog/maps',
      descriptionMd: 'Для stdout используйте стандартное кодирование json.NewEncoder(os.Stdout).Encode(result), включая его экранирование строк. Каждый запуск: один корректный JSON из stdin и один компактный JSON в stdout, без подсказок и отладки. Напишите полный main.go (package main, func main), только стандартная библиотека. Пустые списки сериализуйте как [], не null. Вход — массив строк. Выведите каждую строку ровно один раз, сохранив порядок её первого появления. Не сортируйте и не изменяйте сами строки: регистр, пробелы и Unicode значимы. До 64 строк длиной до 32 Unicode-символов. Пример: ["b","a","b",""] → ["b","a",""]; map нужен только для проверки встреченных значений, порядок его обхода не подходит для stdout.',
      solutionCodeGo: `package main

import (
  "encoding/json"
  "os"
)

func main() {
  var input []string
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  result := make([]string, 0, len(input))
  seen := make(map[string]bool)
  for _, value := range input {
    if !seen[value] {
      seen[value] = true
      result = append(result, value)
    }
  }
  json.NewEncoder(os.Stdout).Encode(result)
}`,
      solutionNotes: 'Slice сохраняет порядок первых появлений, map отвечает только за membership. make гарантирует JSON[], даже если вход пуст.',
      hints: [
        'Не обходите map для формирования ответа.',
        'Пустая строка — полноценный ключ.',
      ],
      runtimeCases: [
        {
          name: 'Порядок первых появлений',
          input: '["b","a","b",""]',
          expected: '["b","a",""]',
          hidden: false,
        },
        {
          name: 'Пустой список',
          input: '[]',
          expected: '[]',
          hidden: false,
        },
        {
          name: 'Все одинаковые',
          input: '["x","x","x"]',
          expected: '["x"]',
          hidden: false,
        },
        {
          name: 'Регистр',
          input: '["A","a","A"]',
          expected: '["A","a"]',
          hidden: true,
        },
        {
          name: 'Кириллица',
          input: '["кот","ёж","кот"]',
          expected: '["кот","ёж"]',
          hidden: true,
        },
        {
          name: 'Пробелы значимы',
          input: '[" a","a"," a",""]',
          expected: '[" a","a",""]',
          hidden: true,
        },
        {
          name: 'Специальные ключи',
          input: '["__proto__","constructor","__proto__"]',
          expected: '["__proto__","constructor"]',
          hidden: true,
        },
        {
          name: 'Несколько пустых',
          input: '["","","x",""]',
          expected: '["","x"]',
          hidden: true,
        },
        {
          name: 'HTML-символы',
          input: '["<b>","&","<b>"]',
          expected: '["\\u003cb\\u003e","\\u0026"]',
          hidden: true,
        },
      ],
      languages: [
        'go',
      ],
      checkMode: 'program',
      starterCode: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      solutionCode: `package main

import (
  "encoding/json"
  "os"
)

func main() {
  var input []string
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  result := make([]string, 0, len(input))
  seen := make(map[string]bool)
  for _, value := range input {
    if !seen[value] {
      seen[value] = true
      result = append(result, value)
    }
  }
  json.NewEncoder(os.Stdout).Encode(result)
}`,
      companies: [
        'microsoft',
      ],
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
      timeLimitMs: 3000,
    },
    {
      slug: 'interview-go-keyed-counter',
      title: 'Go: счётчики по ключам со стабильным выводом',
      difficulty: 'medium',
      interviewFormat: 'livecoding',
      recommendedMinutes: 20,
      tags: [
        'go',
        'hash-table',
        'sorting',
      ],
      sourceUrl: 'https://go.dev/blog/maps',
      descriptionMd: 'Для stdout используйте стандартное кодирование json.NewEncoder(os.Stdout).Encode(result), включая его экранирование строк. Каждый запуск: один корректный JSON из stdin и один компактный JSON в stdout, без подсказок и отладки. Напишите полный main.go (package main, func main), только стандартная библиотека. Пустые списки сериализуйте как [], не null. Вход — массив объектов {key:string,delta:int64}. Сложите delta для каждого key и выведите массив {key,total}, отсортированный по ключу с помощью лексикографического сравнения Go строк. Ключ сохраняется, даже если итог0. Отрицательные delta допустимы; суммы помещаются в int64. До 128 событий; каждый ключ не длиннее 16 Unicode-символов. Пример: [{"key":"b","delta":2},{"key":"a","delta":3},{"key":"b","delta":-2}] → [{"key":"a","total":3},{"key":"b","total":0}].',
      solutionCodeGo: `package main

import (
  "encoding/json"
  "os"
  "sort"
)

type Event struct { Key string \`json:"key"\`; Delta int64 \`json:"delta"\` }
type Counter struct { Key string \`json:"key"\`; Total int64 \`json:"total"\` }

func main() {
  var events []Event
  if err := json.NewDecoder(os.Stdin).Decode(&events); err != nil { return }
  totals := make(map[string]int64)
  for _, event := range events { totals[event.Key] += event.Delta }
  keys := make([]string, 0, len(totals))
  for key := range totals { keys = append(keys, key) }
  sort.Strings(keys)
  result := make([]Counter, 0, len(keys))
  for _, key := range keys { result = append(result, Counter{key, totals[key]}) }
  json.NewEncoder(os.Stdout).Encode(result)
}`,
      solutionNotes: 'Сначала агрегируйте в map[string]int64, затем отдельно отсортируйте ключи. Нулевой итог не равен отсутствию ключа.',
      hints: [
        'Не удаляйте ключ с суммой0.',
        'Тип int32 недостаточен для больших сумм.',
      ],
      runtimeCases: [
        {
          name: 'Возврат к нулю',
          input: '[{"key":"b","delta":2},{"key":"a","delta":3},{"key":"b","delta":-2}]',
          expected: '[{"key":"a","total":3},{"key":"b","total":0}]',
          hidden: false,
        },
        {
          name: 'Пустой вход',
          input: '[]',
          expected: '[]',
          hidden: false,
        },
        {
          name: 'Отрицательная сумма',
          input: '[{"key":"x","delta":-4},{"key":"x","delta":1}]',
          expected: '[{"key":"x","total":-3}]',
          hidden: false,
        },
        {
          name: 'int64',
          input: '[{"key":"x","delta":4000000000},{"key":"x","delta":3000000000}]',
          expected: '[{"key":"x","total":7000000000}]',
          hidden: true,
        },
        {
          name: 'Пустой ключ',
          input: '[{"key":"z","delta":1},{"key":"","delta":2}]',
          expected: '[{"key":"","total":2},{"key":"z","total":1}]',
          hidden: true,
        },
        {
          name: 'Регистр сортировки',
          input: '[{"key":"b","delta":1},{"key":"A","delta":2},{"key":"a","delta":3}]',
          expected: '[{"key":"A","total":2},{"key":"a","total":3},{"key":"b","total":1}]',
          hidden: true,
        },
        {
          name: 'Unicode',
          input: '[{"key":"я","delta":1},{"key":"а","delta":2}]',
          expected: '[{"key":"а","total":2},{"key":"я","total":1}]',
          hidden: true,
        },
        {
          name: 'Нулевая операция',
          input: '[{"key":"x","delta":0}]',
          expected: '[{"key":"x","total":0}]',
          hidden: true,
        },
        {
          name: 'Экранирование ключа',
          input: '[{"key":"<x>","delta":1}]',
          expected: '[{"key":"\\u003cx\\u003e","total":1}]',
          hidden: true,
        },
      ],
      languages: [
        'go',
      ],
      checkMode: 'program',
      starterCode: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      solutionCode: `package main

import (
  "encoding/json"
  "os"
  "sort"
)

type Event struct { Key string \`json:"key"\`; Delta int64 \`json:"delta"\` }
type Counter struct { Key string \`json:"key"\`; Total int64 \`json:"total"\` }

func main() {
  var events []Event
  if err := json.NewDecoder(os.Stdin).Decode(&events); err != nil { return }
  totals := make(map[string]int64)
  for _, event := range events { totals[event.Key] += event.Delta }
  keys := make([]string, 0, len(totals))
  for key := range totals { keys = append(keys, key) }
  sort.Strings(keys)
  result := make([]Counter, 0, len(keys))
  for _, key := range keys { result = append(result, Counter{key, totals[key]}) }
  json.NewEncoder(os.Stdout).Encode(result)
}`,
      companies: [
        'microsoft',
      ],
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
      timeLimitMs: 3000,
    },
    {
      slug: 'interview-go-slice-snapshot',
      title: 'Go: независимый снимок slice',
      difficulty: 'easy',
      interviewFormat: 'debugging',
      recommendedMinutes: 20,
      tags: [
        'go',
        'arrays',
      ],
      sourceUrl: 'https://go.dev/blog/slices-intro',
      descriptionMd: 'Для stdout используйте стандартное кодирование json.NewEncoder(os.Stdout).Encode(result), включая его экранирование строк. Каждый запуск: один корректный JSON из stdin и один компактный JSON в stdout, без подсказок и отладки. Напишите полный main.go (package main, func main), только стандартная библиотека. Пустые списки сериализуйте как [], не null. Вход {values:[]int64,edits:[{index:int,value:int64}]}. Сохраните независимую копию исходного slice, затем примените edits по порядку к рабочему slice и выведите {before:[...],after:[...]}. Индексы всегда корректны, повторная правка одной позиции заменяет предыдущую. До 256 элементов и 256 правок. Ошибка для разбора: before := values копирует заголовок slice, но не backing array; после изменения values снимок тоже изменится. Пример {"values":[1,2],"edits":[{"index":0,"value":9}]} → {"before":[1,2],"after":[9,2]}.',
      solutionCodeGo: `package main

import (
  "encoding/json"
  "os"
)

type Edit struct { Index int \`json:"index"\`; Value int64 \`json:"value"\` }
type Input struct { Values []int64 \`json:"values"\`; Edits []Edit \`json:"edits"\` }
type Output struct { Before []int64 \`json:"before"\`; After []int64 \`json:"after"\` }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  before := make([]int64, len(input.Values))
  after := make([]int64, len(input.Values))
  copy(before, input.Values)
  copy(after, input.Values)
  for _, edit := range input.Edits { after[edit.Index] = edit.Value }
  json.NewEncoder(os.Stdout).Encode(Output{before, after})
}`,
      solutionNotes: 'Нужно выделить другой backing array и скопировать элементы. Обычное присваивание slice этого не делает.',
      hints: [
        'Используйте make и copy.',
        'Для пустого массива make([]int64,0) сериализуется как[].',
      ],
      runtimeCases: [
        {
          name: 'Независимый снимок',
          input: '{"values":[1,2],"edits":[{"index":0,"value":9}]}',
          expected: '{"before":[1,2],"after":[9,2]}',
          hidden: false,
        },
        {
          name: 'Без правок',
          input: '{"values":[3,4],"edits":[]}',
          expected: '{"before":[3,4],"after":[3,4]}',
          hidden: false,
        },
        {
          name: 'Пустой slice',
          input: '{"values":[],"edits":[]}',
          expected: '{"before":[],"after":[]}',
          hidden: false,
        },
        {
          name: 'Последняя правка побеждает',
          input: '{"values":[1],"edits":[{"index":0,"value":5},{"index":0,"value":-7}]}',
          expected: '{"before":[1],"after":[-7]}',
          hidden: true,
        },
        {
          name: 'Обе границы',
          input: '{"values":[1,2,3],"edits":[{"index":0,"value":10},{"index":2,"value":30}]}',
          expected: '{"before":[1,2,3],"after":[10,2,30]}',
          hidden: true,
        },
        {
          name: 'Большие значения',
          input: '{"values":[4000000000,-4000000000],"edits":[{"index":1,"value":0}]}',
          expected: '{"before":[4000000000,-4000000000],"after":[4000000000,0]}',
          hidden: true,
        },
        {
          name: 'Повтор исходного значения',
          input: '{"values":[2,2],"edits":[{"index":0,"value":2}]}',
          expected: '{"before":[2,2],"after":[2,2]}',
          hidden: true,
        },
      ],
      languages: [
        'go',
      ],
      checkMode: 'program',
      starterCode: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      solutionCode: `package main

import (
  "encoding/json"
  "os"
)

type Edit struct { Index int \`json:"index"\`; Value int64 \`json:"value"\` }
type Input struct { Values []int64 \`json:"values"\`; Edits []Edit \`json:"edits"\` }
type Output struct { Before []int64 \`json:"before"\`; After []int64 \`json:"after"\` }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  before := make([]int64, len(input.Values))
  after := make([]int64, len(input.Values))
  copy(before, input.Values)
  copy(after, input.Values)
  for _, edit := range input.Edits { after[edit.Index] = edit.Value }
  json.NewEncoder(os.Stdout).Encode(Output{before, after})
}`,
      companies: [
        'microsoft',
      ],
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
      timeLimitMs: 3000,
    },
    {
      slug: 'interview-go-stable-fan-in',
      title: 'Go: fan-in с происхождением значений',
      difficulty: 'medium',
      interviewFormat: 'language',
      recommendedMinutes: 30,
      tags: [
        'go',
        'concurrency',
        'channels',
        'sorting',
      ],
      descriptionMd: 'Для stdout используйте стандартное кодирование json.NewEncoder(os.Stdout).Encode(result), включая его экранирование строк. Каждый запуск: один корректный JSON из stdin и один компактный JSON в stdout, без подсказок и отладки. Напишите полный main.go (package main, func main), только стандартная библиотека. Пустые списки сериализуйте как [], не null. Вход — массив источников ([] []int64). Запустите отдельную goroutine на каждый источник, объедините их значения через общий канал. Каждое значение должно сохранить source (индекс источника), index (индекс внутри источника), value. После сбора выведите массив объектов {source,index,value}, отсортированный сначала по source, затем по index. Порядок прихода из канала непредсказуем, stdout должен быть стабилен. До64 источников, суммарно до 256 значений. Канал закрывает отдельный координатор после завершения всех отправителей. Автотесты проверяют значения и порядок; использование goroutine/channel и отсутствие гонок разберите по коду с ментором. Пример [[4,5],[],[8]] → [{"source":0,"index":0,"value":4},{"source":0,"index":1,"value":5},{"source":2,"index":0,"value":8}].',
      solutionCodeGo: `package main

import (
  "encoding/json"
  "os"
  "sort"
  "sync"
)

type Value struct { Source int \`json:"source"\`; Index int \`json:"index"\`; Value int64 \`json:"value"\` }

func main() {
  var sources [][]int64
  if err := json.NewDecoder(os.Stdin).Decode(&sources); err != nil { return }
  out := make(chan Value)
  var done sync.WaitGroup
  for source, values := range sources {
    done.Add(1)
    go func(source int, values []int64) {
      defer done.Done()
      for index, value := range values { out <- Value{source, index, value} }
    }(source, values)
  }
  go func() { done.Wait(); close(out) }()
  result := make([]Value, 0)
  for value := range out { result = append(result, value) }
  sort.Slice(result, func(i, j int) bool {
    if result[i].Source != result[j].Source { return result[i].Source < result[j].Source }
    return result[i].Index < result[j].Index
  })
  json.NewEncoder(os.Stdout).Encode(result)
}`,
      solutionNotes: 'Отправители не закрывают общий канал. WaitGroup и единственный координатор обеспечивают закрытие после последней отправки; сортировка устраняет недетерминизм stdout.',
      hints: [
        'Передавайте source/values аргументами goroutine.',
        'Не закрывайте общий канал в каждом producer.',
      ],
      runtimeCases: [
        {
          name: 'Три источника',
          input: '[[4,5],[],[8]]',
          expected: '[{"source":0,"index":0,"value":4},{"source":0,"index":1,"value":5},{"source":2,"index":0,"value":8}]',
          hidden: false,
        },
        {
          name: 'Нет источников',
          input: '[]',
          expected: '[]',
          hidden: false,
        },
        {
          name: 'Все пустые',
          input: '[[],[]]',
          expected: '[]',
          hidden: false,
        },
        {
          name: 'Один источник',
          input: '[[3,2,1]]',
          expected: '[{"source":0,"index":0,"value":3},{"source":0,"index":1,"value":2},{"source":0,"index":2,"value":1}]',
          hidden: true,
        },
        {
          name: 'Повторы',
          input: '[[7],[7,7]]',
          expected: '[{"source":0,"index":0,"value":7},{"source":1,"index":0,"value":7},{"source":1,"index":1,"value":7}]',
          hidden: true,
        },
        {
          name: 'Отрицательные',
          input: '[[-1],[0],[-3]]',
          expected: '[{"source":0,"index":0,"value":-1},{"source":1,"index":0,"value":0},{"source":2,"index":0,"value":-3}]',
          hidden: true,
        },
        {
          name: 'Большие значения',
          input: '[[4000000000],[-4000000000]]',
          expected: '[{"source":0,"index":0,"value":4000000000},{"source":1,"index":0,"value":-4000000000}]',
          hidden: true,
        },
        {
          name: 'Несколько пустых между источниками',
          input: '[[],[2],[],[],[1]]',
          expected: '[{"source":1,"index":0,"value":2},{"source":4,"index":0,"value":1}]',
          hidden: true,
        },
      ],
      languages: [
        'go',
      ],
      checkMode: 'program',
      starterCode: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      solutionCode: `package main

import (
  "encoding/json"
  "os"
  "sort"
  "sync"
)

type Value struct { Source int \`json:"source"\`; Index int \`json:"index"\`; Value int64 \`json:"value"\` }

func main() {
  var sources [][]int64
  if err := json.NewDecoder(os.Stdin).Decode(&sources); err != nil { return }
  out := make(chan Value)
  var done sync.WaitGroup
  for source, values := range sources {
    done.Add(1)
    go func(source int, values []int64) {
      defer done.Done()
      for index, value := range values { out <- Value{source, index, value} }
    }(source, values)
  }
  go func() { done.Wait(); close(out) }()
  result := make([]Value, 0)
  for value := range out { result = append(result, value) }
  sort.Slice(result, func(i, j int) bool {
    if result[i].Source != result[j].Source { return result[i].Source < result[j].Source }
    return result[i].Index < result[j].Index
  })
  json.NewEncoder(os.Stdout).Encode(result)
}`,
      companies: [
        'microsoft',
      ],
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
      sourceUrl: 'https://go.dev/blog/pipelines',
      timeLimitMs: 3000,
    },
    {
      slug: 'interview-go-ordered-worker-pool',
      title: 'Go: bounded worker pool с порядком результатов',
      difficulty: 'medium',
      interviewFormat: 'livecoding',
      recommendedMinutes: 35,
      tags: [
        'go',
        'concurrency',
        'channels',
        'queue',
      ],
      descriptionMd: 'Для stdout используйте стандартное кодирование json.NewEncoder(os.Stdout).Encode(result), включая его экранирование строк. Каждый запуск: один корректный JSON из stdin и один компактный JSON в stdout, без подсказок и отладки. Напишите полный main.go (package main, func main), только стандартная библиотека. Пустые списки сериализуйте как [], не null. Вход {workers:int,values:[]int64}. Постройте пул из workers goroutine: каждая забирает задания из канала и вычисляет квадрат числа. Верните JSON-массив квадратов в порядке входа, а не завершения. 1≤workers≤32; до 512 чисел по модулю≤1000000000, квадрат помещается в int64. Рабочие не должны одновременно дописывать один общий slice через append; сбором занимается один получатель. Автотесты проверяют контракт программы и стабильный порядок; число goroutine и синхронизацию обсуждают при разборе реализации. Пример {"workers":2,"values":[3,-2,5]} → [9,4,25].',
      solutionCodeGo: `package main

import (
  "encoding/json"
  "os"
  "sync"
)

type Input struct { Workers int \`json:"workers"\`; Values []int64 \`json:"values"\` }
type Job struct { Index int; Value int64 }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  jobs := make(chan Job)
  results := make(chan Job)
  var done sync.WaitGroup
  for worker := 0; worker < input.Workers; worker++ {
    done.Add(1)
    go func() {
      defer done.Done()
      for job := range jobs { results <- Job{job.Index, job.Value * job.Value} }
    }()
  }
  go func() {
    for index, value := range input.Values { jobs <- Job{index, value} }
    close(jobs)
  }()
  go func() { done.Wait(); close(results) }()
  answer := make([]int64, len(input.Values))
  for result := range results { answer[result.Index] = result.Value }
  json.NewEncoder(os.Stdout).Encode(answer)
}`,
      solutionNotes: 'Номер задания проходит через оба канала. Единственный collector записывает элементы answer по этому номеру. Производитель закрывает jobs, координатор — results.',
      hints: [
        'Не запускайте goroutine на каждое число.',
        'Заранее выделите результат нужной длины.',
      ],
      runtimeCases: [
        {
          name: 'Два worker',
          input: '{"workers":2,"values":[3,-2,5]}',
          expected: '[9,4,25]',
          hidden: false,
        },
        {
          name: 'Пустой список',
          input: '{"workers":4,"values":[]}',
          expected: '[]',
          hidden: false,
        },
        {
          name: 'Один worker',
          input: '{"workers":1,"values":[4,3,2]}',
          expected: '[16,9,4]',
          hidden: false,
        },
        {
          name: 'Worker больше заданий',
          input: '{"workers":32,"values":[7]}',
          expected: '[49]',
          hidden: true,
        },
        {
          name: 'Нули и повторы',
          input: '{"workers":3,"values":[0,2,0,2]}',
          expected: '[0,4,0,4]',
          hidden: true,
        },
        {
          name: 'Квадраты int64',
          input: '{"workers":2,"values":[1000000000,-1000000000]}',
          expected: '[1000000000000000000,1000000000000000000]',
          hidden: true,
        },
        {
          name: 'Разные знаки',
          input: '{"workers":4,"values":[-5,1,-3,2]}',
          expected: '[25,1,9,4]',
          hidden: true,
        },
        {
          name: 'Стабильный порядок',
          input: '{"workers":8,"values":[9,8,7,6,5,4,3,2,1]}',
          expected: '[81,64,49,36,25,16,9,4,1]',
          hidden: true,
        },
      ],
      languages: [
        'go',
      ],
      checkMode: 'program',
      starterCode: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      solutionCode: `package main

import (
  "encoding/json"
  "os"
  "sync"
)

type Input struct { Workers int \`json:"workers"\`; Values []int64 \`json:"values"\` }
type Job struct { Index int; Value int64 }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  jobs := make(chan Job)
  results := make(chan Job)
  var done sync.WaitGroup
  for worker := 0; worker < input.Workers; worker++ {
    done.Add(1)
    go func() {
      defer done.Done()
      for job := range jobs { results <- Job{job.Index, job.Value * job.Value} }
    }()
  }
  go func() {
    for index, value := range input.Values { jobs <- Job{index, value} }
    close(jobs)
  }()
  go func() { done.Wait(); close(results) }()
  answer := make([]int64, len(input.Values))
  for result := range results { answer[result.Index] = result.Value }
  json.NewEncoder(os.Stdout).Encode(answer)
}`,
      companies: [
        'microsoft',
      ],
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
      sourceUrl: 'https://go.dev/blog/pipelines',
      timeLimitMs: 3000,
    },
    {
      slug: 'interview-go-context-prefix',
      title: 'Go: отмена pipeline после нужного префикса',
      difficulty: 'hard',
      interviewFormat: 'language',
      recommendedMinutes: 40,
      tags: [
        'go',
        'context',
        'channels',
        'cancelation',
        'concurrency',
      ],
      sourceUrl: 'https://go.dev/blog/context',
      descriptionMd: 'Для stdout используйте стандартное кодирование json.NewEncoder(os.Stdout).Encode(result), включая его экранирование строк. Каждый запуск: один корректный JSON из stdin и один компактный JSON в stdout, без подсказок и отладки. Напишите полный main.go (package main, func main), только стандартная библиотека. Пустые списки сериализуйте как [], не null. Вход {values:[]int64,take:int}. Producer отправляет values по порядку, transformer удваивает числа, consumer берёт первые min(take,len(values)) результатов. После достижения take consumer отменяет context и дожидается завершения producer/transformer, даже если не читает остаток. Вывод {values:[...],cancelled:boolean}; cancelled=true ровно когда take<len(input.values). take≥0, до 512 чисел, удвоение помещается в int64. take=0 с непустым входом требует немедленной отмены и[]. Не используйте реальные sleeps для согласования goroutine. Автотесты проверяют префикс/маркер и завершение программы; отсутствие утечек внутри долгоживущего сервиса разбирается отдельно по коду. Пример {"values":[3,4,5],"take":2} → {"values":[6,8],"cancelled":true}.',
      solutionCodeGo: `package main

import (
  "context"
  "encoding/json"
  "os"
  "sync"
)

type Input struct { Values []int64 \`json:"values"\`; Take int \`json:"take"\` }
type Output struct { Values []int64 \`json:"values"\`; Cancelled bool \`json:"cancelled"\` }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  ctx, cancel := context.WithCancel(context.Background())
  defer cancel()
  numbers := make(chan int64)
  doubled := make(chan int64)
  var done sync.WaitGroup
  done.Add(2)
  go func() {
    defer done.Done()
    defer close(numbers)
    for _, value := range input.Values {
      select { case numbers <- value: case <-ctx.Done(): return }
    }
  }()
  go func() {
    defer done.Done()
    defer close(doubled)
    for {
      var value int64
      var ok bool
      select { case <-ctx.Done(): return; case value, ok = <-numbers: }
      if !ok { return }
      select { case doubled <- value * 2: case <-ctx.Done(): return }
    }
  }()
  count := input.Take
  if count > len(input.Values) { count = len(input.Values) }
  answer := make([]int64, 0, count)
  for len(answer) < count {
    value, ok := <-doubled
    if !ok { break }
    answer = append(answer, value)
  }
  cancel()
  done.Wait()
  json.NewEncoder(os.Stdout).Encode(Output{answer, input.Take < len(input.Values)})
}`,
      solutionNotes: 'Каждый потенциально блокирующий send/receive слушает ctx.Done(). После cancel main ждёт WaitGroup, а отправители закрывают только свои выходные каналы.',
      hints: [
        'Cancel сам по себе не ждёт goroutine; нужен WaitGroup.',
        'Пустой consumer не должен оставить producer заблокированным на send.',
      ],
      runtimeCases: [
        {
          name: 'Часть потока',
          input: '{"values":[3,4,5],"take":2}',
          expected: '{"values":[6,8],"cancelled":true}',
          hidden: false,
        },
        {
          name: 'Весь поток',
          input: '{"values":[1,2],"take":2}',
          expected: '{"values":[2,4],"cancelled":false}',
          hidden: false,
        },
        {
          name: 'Немедленная отмена',
          input: '{"values":[1,2],"take":0}',
          expected: '{"values":[],"cancelled":true}',
          hidden: false,
        },
        {
          name: 'Пустой поток',
          input: '{"values":[],"take":0}',
          expected: '{"values":[],"cancelled":false}',
          hidden: true,
        },
        {
          name: 'Take больше длины',
          input: '{"values":[7],"take":9}',
          expected: '{"values":[14],"cancelled":false}',
          hidden: true,
        },
        {
          name: 'Отрицательные числа',
          input: '{"values":[-4,0,-1],"take":2}',
          expected: '{"values":[-8,0],"cancelled":true}',
          hidden: true,
        },
        {
          name: 'Большие числа',
          input: '{"values":[4000000000,-4000000000],"take":2}',
          expected: '{"values":[8000000000,-8000000000],"cancelled":false}',
          hidden: true,
        },
        {
          name: 'Длинный непрочитанный остаток',
          input: '{"values":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128],"take":1}',
          expected: '{"values":[2],"cancelled":true}',
          hidden: true,
        },
      ],
      languages: [
        'go',
      ],
      checkMode: 'program',
      starterCode: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      solutionCode: `package main

import (
  "context"
  "encoding/json"
  "os"
  "sync"
)

type Input struct { Values []int64 \`json:"values"\`; Take int \`json:"take"\` }
type Output struct { Values []int64 \`json:"values"\`; Cancelled bool \`json:"cancelled"\` }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  ctx, cancel := context.WithCancel(context.Background())
  defer cancel()
  numbers := make(chan int64)
  doubled := make(chan int64)
  var done sync.WaitGroup
  done.Add(2)
  go func() {
    defer done.Done()
    defer close(numbers)
    for _, value := range input.Values {
      select { case numbers <- value: case <-ctx.Done(): return }
    }
  }()
  go func() {
    defer done.Done()
    defer close(doubled)
    for {
      var value int64
      var ok bool
      select { case <-ctx.Done(): return; case value, ok = <-numbers: }
      if !ok { return }
      select { case doubled <- value * 2: case <-ctx.Done(): return }
    }
  }()
  count := input.Take
  if count > len(input.Values) { count = len(input.Values) }
  answer := make([]int64, 0, count)
  for len(answer) < count {
    value, ok := <-doubled
    if !ok { break }
    answer = append(answer, value)
  }
  cancel()
  done.Wait()
  json.NewEncoder(os.Stdout).Encode(Output{answer, input.Take < len(input.Values)})
}`,
      companies: [
        'microsoft',
      ],
      companyEvidence: [
        {
          company: 'microsoft',
          kind: 'preparation',
          url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing',
          note: 'Подготовка по официальному гайду; точная задача не подтверждена.',
          checkedAt: '2026-10-10',
        },
      ],
      timeLimitMs: 3000,
    },
    {
      slug: 'interview-avito-go-ledger-core',
      title: 'Go: ядро балансов — адаптация задания Авито',
      difficulty: 'medium',
      interviewFormat: 'livecoding',
      recommendedMinutes: 40,
      tags: [
        'go',
        'hash-table',
        'objects',
      ],
      companies: [
        'avito',
      ],
      sourceUrl: 'https://github.com/avito-tech/job-backend-trainee-assignment',
      companyEvidence: [
        {
          company: 'avito',
          kind: 'preparation',
          url: 'https://github.com/avito-tech/job-backend-trainee-assignment',
          note: 'CLI-адаптация ядра исторического HTTP take-home Авито (2020), archived; не текущая live-coding задача.',
          checkedAt: '2026-10-10',
        },
      ],
      descriptionMd: 'Для stdout используйте стандартное кодирование json.NewEncoder(os.Stdout).Encode(result), включая его экранирование строк. Каждый запуск: один корректный JSON из stdin и один компактный JSON в stdout, без подсказок и отладки. Напишите полный main.go (package main, func main), только стандартная библиотека. Пустые списки сериализуйте как [], не null. Обработайте {operations:[...]}, начиная с пустого ledger. credit/debit имеют {kind,user,amount}; transfer — {kind,from,to,amount}; balance — {kind,user}. amount — положительные целые копейки int64. Наши правила: пустой id, amount≤0, неизвестный kind и перевод себе → status:"invalid"; нехватка средств → "insufficient". Ошибка ничего не меняет. Успех → "ok"; balance дополнительно возвращает balance, для неизвестного id0 без создания счёта. Счёт создаётся при credit или успешном входящем transfer; нулевой существующий счёт сохраняется. Вывод {balances:[{user,balance}],results:[{status,balance?}]}: balances по user лексикографически, results по операциям. До64 операций, id — ASCII до16 символов; успешные суммы помещаются в int64. Это CLI-адаптация вычислительного ядра архивного HTTP/SQL take-home Авито2020, а не полное исходное задание или текущий формат интервью.',
      solutionCodeGo: `package main

import (
  "encoding/json"
  "os"
  "sort"
)

type Operation struct {
  Kind string \`json:"kind"\`
  User string \`json:"user"\`
  From string \`json:"from"\`
  To string \`json:"to"\`
  Amount int64 \`json:"amount"\`
}
type Input struct { Operations []Operation \`json:"operations"\` }
type Result struct { Status string \`json:"status"\`; Balance *int64 \`json:"balance,omitempty"\` }
type Account struct { User string \`json:"user"\`; Balance int64 \`json:"balance"\` }
type Output struct { Balances []Account \`json:"balances"\`; Results []Result \`json:"results"\` }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  balances := make(map[string]int64)
  results := make([]Result, 0, len(input.Operations))
  for _, operation := range input.Operations {
    result := Result{Status:"ok"}
    switch operation.Kind {
    case "balance":
      if operation.User == "" { result.Status = "invalid" } else {
        value := balances[operation.User]
        result.Balance = &value
      }
    case "credit":
      if operation.User == "" || operation.Amount <= 0 { result.Status = "invalid" } else {
        balances[operation.User] += operation.Amount
      }
    case "debit":
      if operation.User == "" || operation.Amount <= 0 { result.Status = "invalid" } else if balances[operation.User] < operation.Amount {
        result.Status = "insufficient"
      } else { balances[operation.User] -= operation.Amount }
    case "transfer":
      if operation.From == "" || operation.To == "" || operation.From == operation.To || operation.Amount <= 0 {
        result.Status = "invalid"
      } else if balances[operation.From] < operation.Amount {
        result.Status = "insufficient"
      } else {
        balances[operation.From] -= operation.Amount
        balances[operation.To] += operation.Amount
      }
    default:
      result.Status = "invalid"
    }
    results = append(results, result)
  }
  users := make([]string, 0, len(balances))
  for user := range balances { users = append(users, user) }
  sort.Strings(users)
  accounts := make([]Account, 0, len(users))
  for _, user := range users { accounts = append(accounts, Account{user, balances[user]}) }
  json.NewEncoder(os.Stdout).Encode(Output{accounts, results})
}`,
      solutionNotes: 'Валидация предшествует записи обеих сторон transfer. Деньги хранятся целыми копейками; чтение map не создаёт счёт. HTTP, SQL и параллельные транзакции остаются вне CLI-контракта.',
      hints: [
        'Проверьте средства до изменения from/to.',
        'Для balance:0 используйте pointer с omitempty, чтобы не потерять ноль.',
      ],
      runtimeCases: [
        {
          name: 'Начисление, перевод и чтение',
          input: '{"operations":[{"kind":"credit","user":"a","amount":100},{"kind":"transfer","from":"a","to":"b","amount":30},{"kind":"balance","user":"a"}]}',
          expected: '{"balances":[{"user":"a","balance":70},{"user":"b","balance":30}],"results":[{"status":"ok"},{"status":"ok"},{"status":"ok","balance":70}]}',
          hidden: false,
        },
        {
          name: 'Пустой ledger',
          input: '{"operations":[]}',
          expected: '{"balances":[],"results":[]}',
          hidden: false,
        },
        {
          name: 'Чтение неизвестного счёта',
          input: '{"operations":[{"kind":"balance","user":"ghost"}]}',
          expected: '{"balances":[],"results":[{"status":"ok","balance":0}]}',
          hidden: false,
        },
        {
          name: 'Недостаточно денег: обе стороны прежние',
          input: '{"operations":[{"kind":"credit","user":"a","amount":20},{"kind":"credit","user":"b","amount":5},{"kind":"transfer","from":"a","to":"b","amount":21}]}',
          expected: '{"balances":[{"user":"a","balance":20},{"user":"b","balance":5}],"results":[{"status":"ok"},{"status":"ok"},{"status":"insufficient"}]}',
          hidden: true,
        },
        {
          name: 'Нет источника: не создавать получателя',
          input: '{"operations":[{"kind":"transfer","from":"missing","to":"new","amount":1},{"kind":"debit","user":"missing","amount":1}]}',
          expected: '{"balances":[],"results":[{"status":"insufficient"},{"status":"insufficient"}]}',
          hidden: true,
        },
        {
          name: 'Нулевые и отрицательные суммы, перевод себе',
          input: '{"operations":[{"kind":"credit","user":"a","amount":10},{"kind":"credit","user":"b","amount":0},{"kind":"debit","user":"a","amount":-2},{"kind":"transfer","from":"a","to":"a","amount":1}]}',
          expected: '{"balances":[{"user":"a","balance":10}],"results":[{"status":"ok"},{"status":"invalid"},{"status":"invalid"},{"status":"invalid"}]}',
          hidden: true,
        },
        {
          name: 'Полное списание сохраняет нулевой счёт',
          input: '{"operations":[{"kind":"credit","user":"a","amount":7},{"kind":"debit","user":"a","amount":7},{"kind":"balance","user":"a"}]}',
          expected: '{"balances":[{"user":"a","balance":0}],"results":[{"status":"ok"},{"status":"ok"},{"status":"ok","balance":0}]}',
          hidden: true,
        },
        {
          name: 'Суммы больше int32',
          input: '{"operations":[{"kind":"credit","user":"a","amount":4000000000},{"kind":"transfer","from":"a","to":"b","amount":3000000000}]}',
          expected: '{"balances":[{"user":"a","balance":1000000000},{"user":"b","balance":3000000000}],"results":[{"status":"ok"},{"status":"ok"}]}',
          hidden: true,
        },
        {
          name: 'Ошибочные идентификаторы и тип',
          input: '{"operations":[{"kind":"credit","user":"","amount":1},{"kind":"balance","user":""},{"kind":"other","user":"x","amount":1}]}',
          expected: '{"balances":[],"results":[{"status":"invalid"},{"status":"invalid"},{"status":"invalid"}]}',
          hidden: true,
        },
        {
          name: 'Порядок операций, снимки чтений и сортировка',
          input: '{"operations":[{"kind":"credit","user":"b","amount":2},{"kind":"credit","user":"a","amount":5},{"kind":"balance","user":"b"},{"kind":"transfer","from":"a","to":"b","amount":5},{"kind":"balance","user":"b"},{"kind":"transfer","from":"b","to":"c","amount":7},{"kind":"balance","user":"b"}]}',
          expected: '{"balances":[{"user":"a","balance":0},{"user":"b","balance":0},{"user":"c","balance":7}],"results":[{"status":"ok"},{"status":"ok"},{"status":"ok","balance":2},{"status":"ok"},{"status":"ok","balance":7},{"status":"ok"},{"status":"ok","balance":0}]}',
          hidden: true,
        },
      ],
      languages: [
        'go',
      ],
      checkMode: 'program',
      starterCode: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      starterCodeGo: `package main

import "fmt"

func main() {
  // Прочитайте JSON из stdin и сформируйте ответ.
  fmt.Println("[]")
}`,
      solutionCode: `package main

import (
  "encoding/json"
  "os"
  "sort"
)

type Operation struct {
  Kind string \`json:"kind"\`
  User string \`json:"user"\`
  From string \`json:"from"\`
  To string \`json:"to"\`
  Amount int64 \`json:"amount"\`
}
type Input struct { Operations []Operation \`json:"operations"\` }
type Result struct { Status string \`json:"status"\`; Balance *int64 \`json:"balance,omitempty"\` }
type Account struct { User string \`json:"user"\`; Balance int64 \`json:"balance"\` }
type Output struct { Balances []Account \`json:"balances"\`; Results []Result \`json:"results"\` }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { return }
  balances := make(map[string]int64)
  results := make([]Result, 0, len(input.Operations))
  for _, operation := range input.Operations {
    result := Result{Status:"ok"}
    switch operation.Kind {
    case "balance":
      if operation.User == "" { result.Status = "invalid" } else {
        value := balances[operation.User]
        result.Balance = &value
      }
    case "credit":
      if operation.User == "" || operation.Amount <= 0 { result.Status = "invalid" } else {
        balances[operation.User] += operation.Amount
      }
    case "debit":
      if operation.User == "" || operation.Amount <= 0 { result.Status = "invalid" } else if balances[operation.User] < operation.Amount {
        result.Status = "insufficient"
      } else { balances[operation.User] -= operation.Amount }
    case "transfer":
      if operation.From == "" || operation.To == "" || operation.From == operation.To || operation.Amount <= 0 {
        result.Status = "invalid"
      } else if balances[operation.From] < operation.Amount {
        result.Status = "insufficient"
      } else {
        balances[operation.From] -= operation.Amount
        balances[operation.To] += operation.Amount
      }
    default:
      result.Status = "invalid"
    }
    results = append(results, result)
  }
  users := make([]string, 0, len(balances))
  for user := range balances { users = append(users, user) }
  sort.Strings(users)
  accounts := make([]Account, 0, len(users))
  for _, user := range users { accounts = append(accounts, Account{user, balances[user]}) }
  json.NewEncoder(os.Stdout).Encode(Output{accounts, results})
}`,
      timeLimitMs: 3000,
    },
  ],
}
