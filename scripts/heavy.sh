#!/bin/sh
# Тяжёлые проверки (линтер, типы, тесты, сборка) из всех worktree и агентов идут через
# общую на машину очередь heavy: https://github.com/mokevnin/heavy. Вложенные вызовы и CI
# heavy пропускает сам. Без heavy команда запускается сразу, как раньше.
if command -v heavy >/dev/null 2>&1; then
  # За чужим длинным e2e можно ждать дольше таймаута команды агента: после 15 минут
  # проверка идёт без места, то есть занятая машина её замедляет, но не валит.
  export HEAVY_TIMEOUT="${HEAVY_TIMEOUT:-900}" HEAVY_ON_TIMEOUT="${HEAVY_ON_TIMEOUT:-run}"
  exec heavy -- "$@"
fi
if [ -z "$CI" ] && [ -z "$LMS_HEAVY_HINT" ]; then
  echo '[heavy] не установлен, проверка идёт без очереди. Установка: brew install mokevnin/tap/heavy' >&2
  export LMS_HEAVY_HINT=1
fi
exec "$@"
