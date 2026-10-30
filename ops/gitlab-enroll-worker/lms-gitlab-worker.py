#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Исполнитель зачислений буткемпа в VM GitLab.

Забирает из LMS задания «завести ученика в GitLab» и выполняет их через локальный
API GitLab от имени root. Токен root не покидает VM: LMS не знает его и не может
обратиться к GitLab сама, исполнитель только забирает задания и отчитывается.
Шаги те же, что у `npm run students:add` (bootcamp/content): каждый сначала смотрит,
сделан ли он, поэтому повтор доделывает прерванное и ничего не дублирует, а
расхождения с обычными настройками показывает, но не исправляет.

Раз в 5 минут исполнитель проверяет, вошли ли недавно зачисленные в GitLab впервые.
Только стандартная библиотека: в VM GitLab нет Node и pip.
"""
import datetime
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

LMS_URL = os.environ.get('LMS_URL', 'https://learn.mentorcareer.ru').rstrip('/')
KEY_FILE = os.environ.get('LMS_WORKER_KEY_FILE', '/etc/lms-gitlab-worker/key')
GITLAB_API = os.environ.get('GITLAB_API', 'http://127.0.0.1/api/v4')
# Тот же файл заголовка, что у обёртки glapi: «PRIVATE-TOKEN: …», только для root.
GITLAB_HEADER_FILE = os.environ.get('GITLAB_HEADER_FILE', '/root/gitlab-api-header')
POLL_SECONDS = int(os.environ.get('POLL_SECONDS', '15'))
WATCH_EVERY_SECONDS = 300

GRADING_PROJECT = 'bootcamp-staff/grading'
DEVELOPER = 30
MAINTAINER = 40
# Форк копирует настройки курса (CI и MR там выключены), поэтому проекту ученика они
# задаются явно. Реестр, пакеты, wiki и Pages в курсе не нужны.
PROJECT_SETTINGS = {
    'visibility': 'private',
    'merge_requests_access_level': 'enabled',
    'builds_access_level': 'enabled',
    'issues_access_level': 'enabled',
    'forking_access_level': 'disabled',
    'wiki_access_level': 'disabled',
    'snippets_access_level': 'disabled',
    'container_registry_access_level': 'disabled',
    'packages_enabled': False,
    'pages_access_level': 'disabled',
    'environments_access_level': 'disabled',
    'shared_runners_enabled': True,
    'request_access_enabled': False,
    'remove_source_branch_after_merge': True,
}


def log(message):
    print(message, flush=True)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class StepError(Exception):
    """Ошибка, которую должен увидеть наставник: уходит в LMS и в Telegram."""


def http(method, url, headers, body=None, timeout=30):
    data = None if body is None else json.dumps(body).encode('utf-8')
    request = urllib.request.Request(url, data=data, method=method, headers=dict(headers, **({'Content-Type': 'application/json'} if data else {})))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            parsed = json.loads(raw) if raw else None
        except ValueError:
            parsed = raw[:300].decode('utf-8', 'replace')
        return error.code, parsed


def gitlab_headers():
    headers = {}
    with open(GITLAB_HEADER_FILE, encoding='utf-8') as file:
        for line in file:
            if ':' in line:
                name, value = line.split(':', 1)
                headers[name.strip()] = value.strip()
    return headers


def gl(method, path, body=None, allow404=False):
    status, data = http(method, GITLAB_API + path, gitlab_headers(), body)
    if status == 404 and allow404:
        return None
    if status >= 400:
        raise StepError('GitLab %s %s: %s %s' % (method, path, status, str(data)[:300]))
    return data


def lms(method, path, body=None):
    with open(KEY_FILE, encoding='utf-8') as file:
        key = file.read().strip()
    status, data = http(method, LMS_URL + path, {'x-lms-worker-key': key, 'User-Agent': 'lms-gitlab-worker'}, {} if body is None else body)
    if status >= 400:
        raise RuntimeError('LMS %s %s: %s %s' % (method, path, status, str(data)[:300]))
    return data


def q(value):
    return urllib.parse.quote(str(value), safe='')


def levels(items):
    return ','.join(str(item.get('access_level')) for item in items or [])


def usual_protection(protection):
    return levels(protection.get('push_access_levels')) == str(MAINTAINER) and levels(protection.get('merge_access_levels')) == str(MAINTAINER) and not protection.get('allow_force_push')


def differing_settings(project):
    return [key for key, value in PROJECT_SETTINGS.items() if project.get(key) != value]


class Job:
    def __init__(self, job, webhook):
        self.job = job
        self.webhook = webhook
        self.steps = {step['key']: step for step in job.get('steps', [])}
        self.extra = {}
        self.user = None
        self.project = None

    def report(self, status='running', error=None):
        body = {'status': status, 'steps': list(self.steps.values()), **self.extra}
        if error:
            body['error'] = error
        lms('POST', '/api/internal/bootcamp-enrollments/%s/report' % self.job['id'], body)

    def step(self, key, run):
        try:
            state, detail = run()
        except StepError as error:
            self.steps[key] = {'key': key, 'state': 'failed', 'detail': str(error)[:500], 'at': now()}
            raise
        self.steps[key] = {'key': key, 'state': state, 'detail': detail, 'at': now()}
        self.report()

    def preflight(self):
        group = self.job['group']
        if not gl('GET', '/groups/%s' % q(group), allow404=True):
            raise StepError('В GitLab нет группы %s: поток заводится по ops/grading/README.md эталона' % group)
        graded = gl('GET', '/projects/%s/variables/GRADER_GROUPS' % q(GRADING_PROJECT))['value']
        if group not in [name.strip() for name in graded.split(',')]:
            raise StepError('Группы %s нет в GRADER_GROUPS проекта %s: сдачи не проверялись бы' % (group, GRADING_PROJECT))

    def gitlab_user(self):
        username, email = self.job['username'], self.job['email'].lower()
        found = gl('GET', '/users?username=%s' % q(username))
        user = found[0] if found else None
        by_email = [item for item in gl('GET', '/users?search=%s' % q(email)) if (item.get('email') or '').lower() == email]
        if user and (user.get('email') or '').lower() != email:
            raise StepError('Логин %s в GitLab занят учёткой с другой почтой' % username)
        if not user and by_email:
            raise StepError('Почта %s уже у учётки GitLab %s' % (email, by_email[0]['username']))
        if user:
            self.user = user
            detail = 'учётка уже была (%s), письмо не отправлялось' % user.get('state')
        else:
            self.user = gl('POST', '/users', {
                'username': username, 'email': email, 'name': '%s %s' % (self.job['firstName'], self.job['lastName']),
                'skip_confirmation': True, 'reset_password': True, 'projects_limit': 0, 'can_create_group': False,
            })
            detail = 'создана, GitLab отправил письмо со ссылкой для пароля'
        self.extra['gitlabUserId'] = self.user['id']
        return 'done', detail

    def gitlab_project(self):
        group, username = self.job['group'], self.job['username']
        project = gl('GET', '/projects/%s' % q('%s/%s' % (group, username)), allow404=True)
        if project:
            notes = ['проект уже был']
            differs = differing_settings(project)
            if differs:
                notes.append('настройки отличаются от обычных: %s, не трогаю' % ', '.join(differs))
            if project.get('forked_from_project'):
                notes.append('проект связан форком, проверьте вручную')
            self.project = project
        else:
            course = gl('GET', '/projects/%s' % q(self.job['courseProject']))
            course_main = gl('GET', '/projects/%s/repository/branches/main' % course['id'])['commit']
            fork = gl('POST', '/projects/%s/fork' % course['id'], {
                'namespace_path': group, 'path': username, 'name': username, 'visibility': 'private',
                'description': 'Проект ученика: %s %s' % (self.job['firstName'], self.job['lastName']),
            })
            for _ in range(120):
                state = gl('GET', '/projects/%s' % fork['id'])
                if state.get('import_status') == 'finished':
                    break
                if state.get('import_status') == 'failed':
                    raise StepError('Копия курса не создалась: %s' % state.get('import_error'))
                time.sleep(1)
            else:
                raise StepError('Копия курса не готова за 2 минуты')
            # Связь форка ученику не нужна: материалы недели приходят из upstream (методичка 00).
            gl('DELETE', '/projects/%s/fork' % fork['id'])
            project = gl('PUT', '/projects/%s' % fork['id'], PROJECT_SETTINGS)
            differs = differing_settings(project)
            if differs or project.get('forked_from_project'):
                raise StepError('Настройки проекта не применились: %s' % (', '.join(differs) or 'связь форка'))
            main = gl('GET', '/projects/%s/repository/branches/main' % fork['id'])['commit']
            if main['id'] != course_main['id']:
                raise StepError('main проекта %s, а у курса %s' % (main['short_id'], course_main['short_id']))
            self.project = project
            notes = ['создан из %s на %s' % (self.job['courseProject'], course_main['short_id'])]
        self.extra['gitlabProjectId'] = self.project['id']
        self.extra['gitlabProjectUrl'] = self.project['web_url']
        return 'done', ', '.join(notes)

    def gitlab_protect(self):
        pid = self.project['id']
        protection = gl('GET', '/projects/%s/protected_branches/main' % pid, allow404=True)
        if protection:
            if usual_protection(protection):
                return 'done', 'защита уже стояла'
            return 'skipped', 'защита не обычная (push %s, merge %s), не трогаю' % (levels(protection.get('push_access_levels')), levels(protection.get('merge_access_levels')))
        gl('POST', '/projects/%s/protected_branches' % pid, {'name': 'main', 'push_access_level': MAINTAINER, 'merge_access_level': MAINTAINER, 'allow_force_push': False})
        return 'done', 'push и слияние только у наставника'

    def gitlab_member(self):
        pid, uid = self.project['id'], self.user['id']
        member = gl('GET', '/projects/%s/members/%s' % (pid, uid), allow404=True)
        if member:
            if member.get('access_level') == DEVELOPER:
                return 'done', 'роль уже была'
            return 'skipped', 'роль %s вместо обычной 30 (Developer), не трогаю' % member.get('access_level')
        gl('POST', '/projects/%s/members' % pid, {'user_id': uid, 'access_level': DEVELOPER})
        return 'done', 'Developer'

    def gitlab_webhook(self):
        if not self.webhook:
            return 'skipped', 'LMS не выдала токен вебхука'
        pid = self.project['id']
        body = {
            'url': self.webhook['url'], 'token': self.webhook['token'], 'enable_ssl_verification': True,
            'merge_requests_events': True, 'pipeline_events': True, 'note_events': True, 'push_events': False,
        }
        existing = next((hook for hook in gl('GET', '/projects/%s/hooks' % pid) if hook.get('url') == self.webhook['url']), None)
        if existing:
            gl('PUT', '/projects/%s/hooks/%s' % (pid, existing['id']), body)
            return 'done', 'вебхук уже был, токен и события обновлены'
        gl('POST', '/projects/%s/hooks' % pid, body)
        return 'done', 'MR, CI и комментарии приходят в LMS'

    def run(self):
        log('зачисление %s: %s в %s' % (self.job['id'], self.job['username'], self.job['group']))
        try:
            self.preflight()
            self.step('gitlab_user', self.gitlab_user)
            self.step('gitlab_project', self.gitlab_project)
            self.step('gitlab_protect', self.gitlab_protect)
            self.step('gitlab_member', self.gitlab_member)
            self.step('gitlab_webhook', self.gitlab_webhook)
        except StepError as error:
            log('зачисление %s: ошибка: %s' % (self.job['id'], error))
            self.report('failed', str(error))
            return
        self.report('done')
        log('зачисление %s: готово, %s' % (self.job['id'], self.extra.get('gitlabProjectUrl')))


def check_first_sign_in(watch):
    for item in watch:
        user = gl('GET', '/users/%s' % item['gitlabUserId'], allow404=True)
        if user and user.get('last_sign_in_at'):
            lms('POST', '/api/internal/bootcamp-enrollments/%s/signed-in' % item['id'], {'at': user['last_sign_in_at']})
            log('зачисление %s: первый вход в GitLab %s' % (item['id'], user['last_sign_in_at']))


def main():
    log('исполнитель зачислений запущен, LMS %s' % LMS_URL)
    last_watch = 0.0
    while True:
        try:
            claim = lms('POST', '/api/internal/bootcamp-enrollments/claim')
            if claim.get('job'):
                Job(claim['job'], claim.get('webhook')).run()
                continue
            if time.time() - last_watch >= WATCH_EVERY_SECONDS:
                last_watch = time.time()
                check_first_sign_in(claim.get('watch') or [])
        except Exception as error:  # noqa: BLE001 - цикл не должен падать; задание вернётся в очередь по истечении аренды
            log('ошибка цикла: %s' % error)
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    main()
