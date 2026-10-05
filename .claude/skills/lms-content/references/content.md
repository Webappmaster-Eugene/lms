# Учебный контент и настройки

Источники: `Courses.ts`, `Sections.ts`, `Lessons.ts`, `FaqItems.ts`, `Media.ts`
в `src/payload/collections/`, блоки `src/payload/blocks/`, global
`src/payload/globals/SiteSettings.ts`.

- Курс требует `title` и ID `roadmap`, раздел — `title` и ID `course`, урок —
  `title` и ID `course`. Необязательная `section` урока должна принадлежать
  тому же курсу: сам relationship не гарантирует соответствие двух родителей.
- `order` курса задаёт порядок в роадмапе, раздела — в курсе, урока — в разделе.
  Для вставки между записями предварительно прочитай их порядок.
- У курса, раздела, урока и роадмапа отдельные `isPublished`, по умолчанию false.
  Не публикуй цепочку из-за правки одного текста. Для публикации программы
  проверь все флаги и связи. Сам REST не объединяет записи в транзакцию.
- При переименовании явно передай старый `slug` вместе с `title`: `generateSlug`
  может сгенерировать новый slug при PATCH только названия. Изменение URL —
  отдельное поручение.
- `description` курса — Lexical JSON. `content` урока — массив блоков `text`,
  `video`, `image`, `link`, `miro`, `file`. Текстовый блок:
  `{ blockType: 'text', content: <Lexical JSON> }`. Строка/Markdown не заменяют
  Lexical; минимальный образец — `lexical` в `tests/integration/helpers/fixtures.ts`.
- PATCH массива `content` заменяет его целиком. При добавлении блока прочитай
  старый массив и сохрани прежние элементы и ID. Так же поступай с другими
  массивами. Файл сначала загрузи в `media`, затем используй его ID в upload-поле.
- Для импорта используй `/admin/import-yandex` и существующий API. Создание
  записи в `yandex-disk-imports` само по себе не импортирует курс.
- FAQ: `question`, Lexical `answer`, `order`, `isPublished`. По умолчанию он
  опубликован — для черновика явно задавай false. `/help` фильтрует публикацию,
  но REST-access коллекции разрешает публичное чтение даже черновиков;
  этот флаг не обеспечивает конфиденциальность ответа.
- Настройки — global `site-settings`: изменение REST через POST
  `/api/globals/site-settings`, Local API через `updateGlobal`. При правке
  одного контакта сохрани остальные поля `contacts` и не затронь `points`.
- Удаление урока очищает связанные данные. Если нужна временная недоступность,
  снятие с публикации обычно сохраняет историю лучше удаления.

Просмотр: `/courses/<slug>`, `/lessons/<slug>`, `/help`, `/contacts`.
Обычное управление учебной программой выполняется в самой LMS:
«Управление → Учебный контент → роадмап → курс → программа». Со страницы
карты — «Курсы и уроки» / «Добавить курс»; из темы — «Добавить курс в тему».
Страницы редакторов: `/manage/courses/new`, `/manage/courses/<id>`,
`/manage/courses/<id>/settings`, `/manage/lessons/new?course=<id>&section=<id>`,
`/manage/lessons/<id>`. Контент с черновиками доступен только администратору.
API редакторов — `POST /api/manage/content/<collection>` и
`PATCH /api/manage/content/<collection>/<id>`: Payload auth admin, native поля,
`expectedUpdatedAt` для обновления; при создании `Idempotency-Key` UUIDv4
обеспечивает безопасное повторение неизменённого запроса. С ключом адрес
генерируется автоматически; пользовательский slug задаётся после создания.

CMS — «Управление → CMS и настройки», расширенные коллекции в
«Настройки контента в CMS», FAQ/контакты в «Общение и настройки».
Редактирование: `/admin/collections/<collection>/<id>`.
