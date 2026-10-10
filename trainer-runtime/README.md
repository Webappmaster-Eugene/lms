# Изолированный runtime тренажёра

Сервис принимает доверенные запросы LMS по Bearer `TRAINER_RUNTIME_TOKEN` (минимум 32 символа). `TRAINER_RUNTIME_URL` нужен только серверу LMS. Секреты LMS и Docker socket не передаются job-контейнерам.

Gateway имеет доступ к Docker daemon и должен работать на выделенном runner-хосте/daemon без контейнеров и секретов LMS. Docker socket даёт gateway управление этим daemon: не подключайте его к приложению или пользовательскому sandbox. Gateway HTTP публикуется только для LMS, не в интернет.

```sh
docker build --target go-job -t lms-trainer-go:local trainer-runtime
docker build --target python-job -t lms-trainer-python:local trainer-runtime
docker build --target frontend-job -t lms-trainer-frontend:local trainer-runtime
docker build -f trainer-runtime/Dockerfile.next -t lms-trainer-next:local trainer-runtime
docker build --target gateway -t lms-trainer-gateway:local trainer-runtime
node --test trainer-runtime/tests/*.test.mjs
TRAINER_RUNTIME_INTEGRATION=1 node --test trainer-runtime/tests/execution.test.mjs
TRAINER_RUNTIME_INTEGRATION=1 node --test trainer-runtime/tests/python-execution.test.mjs
```

Имена job-образов настраиваются `TRAINER_GO_JOB_IMAGE`, `TRAINER_PYTHON_JOB_IMAGE`, `TRAINER_FRONTEND_JOB_IMAGE`, `TRAINER_NEXT_JOB_IMAGE`. Job-образы должны быть собраны заранее: запуск использует `--pull never`, а сеть во время выполнения отключена.

Go: полный `package main`, stdin/stdout, стандартная библиотека, без CGO/сторонних модулей. Код компилируется один раз в отдельном контейнере, бинарник запускается в новом контейнере для каждого теста. Gateway сравнивает вывод с эталоном; скрытые эталоны не попадают в Go-контейнер. Конечные пробелы/переводы строк stdout не учитываются.

Python: один скрипт Python 3.13, UTF-8 stdin/stdout, стандартная библиотека. Проверка синтаксиса через встроенный `compile(..., "exec")` проходит в отдельном контейнере без исполнения кода; затем каждый тест получает новый контейнер и запускает `python3 -I -S -X utf8 -u`. Окружение дочернего Python очищено, user site-packages отключены. Pip install и внешние пакеты недоступны. Gateway сравнивает stdout как в Go: конечные пробелы и переводы строк не учитываются. Скрытые эталоны и названия кейсов не попадают в Python-контейнер; stdout/traceback скрытого кейса не возвращаются ученику. Пустой список кейсов допускается только с доверенным `allowNoTests: true` для консоли комнаты, без начисления прогресса.

HTML: `index.html`, локальные CSS и JS. React: `App.jsx` или `App.tsx` с default export, локальные импорты, React/React DOM из образа, `styles.css`, CSS Modules `*.module.css` с `import styles`. Frontend передаётся строкой JSON `{"имя файла":"содержимое"}`. Npm install, CDN и произвольные внешние пакеты недоступны.

`POST /run`: `{language,code,cases,timeLimitMs,includePreview?}`. Без `includePreview` возвращает `TrainerRunResult`; с ним — `{result,preview?}`. `POST /preview` возвращает `{html}` для HTML/React. Проверки исполняет доверенный Node/Playwright-процесс, пользовательский JS — только Chromium в `iframe sandbox="allow-scripts"`. Assertions и скрытые кейсы не включаются в HTML. CSS берётся через нативный Chromium CDP: переопределение `getComputedStyle` в решении не подменяет вердикт. Chromium работает внутри отдельного ограниченного контейнера; browser sandbox Playwright не заменяет Docker-границу.

Проверки интерфейса поддерживают `action: "press"` с `value` из списка `Enter`, `Escape`, `Space`, `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `Tab`. Клавиша нажимается на элементе `selector`. Произвольные сочетания клавиш отклоняются; этот же контракт действует в HTML, React и Next.js.

Next.js запускает настоящий App Router сервер в собственном job-контейнере: серверные компоненты, клиентские компоненты, локальные импорты и route handlers. Checker работает в другом контейнере, закрытые проверки не передаются пользовательскому Node-процессу. Next preview возвращает `{leaseToken,expiresAt,previewPath}`; LMS проксирует только этот lease через `/api/trainer/preview/<token>/`. LMS cookies, авторизация, Origin и внешние redirects не передаются пользовательскому Next. Lease ограничен временем; `DELETE /next/lease/<token>` освобождает его перед новым запуском. Gateway proxy `/next/preview/<token>/...` тоже требует Bearer авторизацию. Свои `package.json`, `next.config.*`, npm lifecycle scripts, установка пакетов и сетевые запросы наружу не поддерживаются.

Ограничения: 20 000 символов кода, 32 файла, 50 тестов, 100–10000 мс на тест, 2 параллельных задания, bounded output. Контейнеры без сети, с read-only root, non-root UID, без capabilities, no-new-privileges, лимитами CPU/RAM/PID и временным filesystem. Независимый PID 1 watchdog `/usr/bin/timeout --signal=KILL 180s` ограничивает время жизни job даже после потери gateway или остановки Node worker. Падение Docker/образа — HTTP 503, ошибка решения — штатный результат без начисления прогресса. Сервис сам не работает с БД/прогрессом.
