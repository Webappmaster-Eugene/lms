# Исполнитель зачислений в VM GitLab

Кнопка «Зачислить» в заявке на буткемп (CMS LMS) сразу заводит учётку LMS и открывает
курс методичек, а учётку и проект в GitLab создаёт этот исполнитель. Он живёт в VM
`gitlab`, раз в 15 секунд забирает задание из LMS (`POST /api/internal/bootcamp-enrollments/claim`)
и выполняет шаги через локальный API GitLab от имени root, отчитываясь после каждого.
Токен root VM не покидает; LMS не может обратиться к GitLab сама.

Шаги те же, что у `npm run students:add` репозитория bootcamp/content: учётка с письмом
для пароля, проект `<поток>/<логин>` форком `bootcamp/course` с разорванной связью,
защита `main`, роль Developer. Сверх того исполнитель ставит в проект вебхук
`/api/bootcamp/gitlab-events`: MR, CI и комментарии ученика приходят наставнику в Telegram.
Раз в 5 минут он проверяет, вошли ли недавно зачисленные в GitLab впервые.

## Установка (root в VM gitlab)

```sh
install -m 0755 lms-gitlab-worker.py /usr/local/sbin/lms-gitlab-worker
install -m 0644 lms-gitlab-worker.service /etc/systemd/system/
install -d -m 0700 /etc/lms-gitlab-worker
# Ключ: HMAC-SHA256 от PAYLOAD_SECRET прода по метке lms-bootcamp-enroll-worker-v1,
# 64 шестнадцатеричных знака. Считается в контейнере LMS и сразу пишется сюда, на экран не выводится.
chmod 0600 /etc/lms-gitlab-worker/key
systemctl daemon-reload && systemctl enable --now lms-gitlab-worker
journalctl -u lms-gitlab-worker -f
```

Ключ из Mac по SSH, без вывода значения (`infra/ssh.cfg`):

```sh
ssh -F infra/ssh.cfg vm 'c=$(sudo -n docker ps --format "{{.Names}}" | grep lms-mentor-app | head -1); sudo -n docker exec "$c" node -e "process.stdout.write(require(\"crypto\").createHmac(\"sha256\", process.env.PAYLOAD_SECRET).update(\"lms-bootcamp-enroll-worker-v1\").digest(\"hex\"))"' \
  | ssh -F infra/ssh.cfg gitlab 'sudo install -d -m 0700 /etc/lms-gitlab-worker && sudo tee /etc/lms-gitlab-worker/key >/dev/null && sudo chmod 0600 /etc/lms-gitlab-worker/key'
```

Смена `PAYLOAD_SECRET` меняет ключ исполнителя и токен вебхуков: ключ кладут заново,
а вебхуки проектов обновит повтор зачисления (или правка токена в настройках проекта).

## Если зачисление упало

Причина видна в заявке, в карточке зачисления и в Telegram. После исправления -
«Повторить шаги GitLab» в заявке: сделанные шаги исполнитель пропустит. Брошенное
задание (исполнитель перезапустился посреди работы) LMS отдаёт снова через 10 минут,
после пяти таких попыток помечает ошибкой.
