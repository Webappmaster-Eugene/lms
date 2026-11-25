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
После возврата денег LMS передает ID проектов и учеников для отзыва членства.
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

# Проект проверки приходит в задании из программы буткемпа; это значение - для LMS до программ.
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


class GitLabError(StepError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


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
        raise GitLabError(status, 'GitLab %s %s: %s %s' % (method, path, status, str(data)[:300]))
    return data


def lms(method, path, body=None):
    with open(KEY_FILE, encoding='utf-8') as file:
        key = file.read().strip()
    headers = {'x-lms-worker-key': key, 'User-Agent': 'lms-gitlab-worker'}
    if method == 'POST' and path == '/api/internal/bootcamp-enrollments/claim':
        headers['x-lms-enrollment-protocol'] = '2'
    status, data = http(method, LMS_URL + path, headers, {} if body is None else body)
    if status >= 400:
        raise RuntimeError('LMS %s %s: %s %s' % (method, path, status, str(data)[:300]))
    return data


def q(value):
    return urllib.parse.quote(str(value), safe='')


def levels(items):
    return ','.join(str(item.get('access_level')) for item in items or [])


def usual_protection(protection):
    rules = (protection.get('push_access_levels'), protection.get('merge_access_levels'))
    return protection.get('allow_force_push') is False and all(
        levels(items) == str(MAINTAINER)
        and not any(items[0].get(key) for key in ('user_id', 'group_id', 'deploy_key_id'))
        for items in rules
    )


def differing_settings(project):
    return [key for key, value in PROJECT_SETTINGS.items() if project.get(key) != value]


def automatic_account(job):
    return 'lease' in job and job.get('autoResolveUsername') is True


def positive_id(value):
    return type(value) is int and value > 0


def user_with_primary_email(email):
    matches = {}
    page = 1
    while True:
        users = gl('GET', '/users?search=%s&per_page=100&page=%s' % (q(email), page))
        for user in users:
            if (user.get('email') or '').lower() == email:
                matches[user['id']] = user
        if len(users) < 100:
            break
        page += 1
    if len(matches) > 1:
        raise StepError('Основная почта совпала с несколькими учётками GitLab')
    return next(iter(matches.values()), None)


def verified_student_account(user, email, grader_id):
    # Список по имени без humans также возвращает служебные учётные записи.
    regular = gl('GET', '/users?username=%s&humans=true' % q(user['username']))
    if len(regular) != 1 or regular[0]['id'] != user['id']:
        raise StepError('Для учебного проекта нужна личная учётка GitLab')
    account = regular[0]
    if (account.get('email') or '').lower() != email or not account.get('confirmed_at'):
        raise StepError('Основная почта GitLab должна быть подтверждена и совпадать с почтой в LMS')
    if account.get('state') != 'active' or account.get('locked'):
        raise StepError('Учётка GitLab не активна или заблокирована')
    if account.get('is_admin') is not False or account.get('is_auditor') or account.get('bot') or account['id'] == grader_id:
        raise StepError('Служебная учётка GitLab не может быть учеником')
    return account


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
        if 'lease' in self.job:
            body['lease'] = self.job['lease']
            path = '/api/internal/tutoring-projects/%s/report'
        else:
            path = '/api/internal/bootcamp-enrollments/%s/report'
        lms('POST', path % self.job['id'], body)

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
        namespace = gl('GET', '/groups/%s' % q(group), allow404=True)
        if not namespace:
            raise StepError('В GitLab нет группы %s: поток заводится по ops/grading/README.md эталона' % group)
        grading = self.job.get('gradingProject') or GRADING_PROJECT
        graded = gl('GET', '/projects/%s/variables/GRADER_GROUPS' % q(grading))['value']
        if group not in [name.strip() for name in graded.split(',')]:
            raise StepError('Группы %s нет в GRADER_GROUPS проекта %s: сдачи не проверялись бы' % (group, grading))
        if 'lease' in self.job:
            if namespace.get('visibility') != 'private' or namespace.get('full_path') != group:
                raise StepError('Группа менторства должна быть приватной и совпадать с путём в LMS')
            grader_id = self.job.get('graderUserId')
            grader_role = gl('GET', '/groups/%s/members/all/%s' % (namespace['id'], grader_id), allow404=True) if grader_id else None
            if not grader_role or grader_role.get('access_level') != DEVELOPER:
                raise StepError('Доверенный бот должен иметь роль Developer в группе менторства')
            page = 1
            while True:
                members = gl('GET', '/groups/%s/members/all?per_page=100&page=%s' % (namespace['id'], page))
                if any(m.get('id') != grader_id and m.get('access_level', 0) < MAINTAINER for m in members):
                    raise StepError('В группе есть участник с доступом ко всем проектам менторства')
                if len(members) < 100:
                    break
                page += 1


    def existing_gitlab_user(self, username, email):
        expected = self.job.get('gitlabUserId')
        if 'lease' not in self.job and expected is not None:
            # В массовом курсе это ID, ранее подтвержденный для того же ученика LMS.
            # Путь нового проекта может отличаться от нынешнего логина аккаунта.
            if not positive_id(expected):
                raise StepError('В LMS указан неверный ID ученика GitLab')
            user = gl('GET', '/users/%s' % expected, allow404=True)
            if not user or user.get('id') != expected:
                raise StepError('Не найдена подтвержденная учетная запись ученика GitLab')
            return user
        found = gl('GET', '/users?username=%s' % q(username))
        user = found[0] if found else None
        if user and (user.get('email') or '').lower() != email:
            raise StepError('Логин %s в GitLab занят учёткой с другой почтой' % username)
        by_email = user_with_primary_email(email)
        auto = automatic_account(self.job)
        if user and by_email and user['id'] != by_email['id']:
            raise StepError('Логин и основная почта указывают на разные учётки GitLab')
        if not user and by_email:
            if not auto:
                raise StepError('Почта %s уже у учётки GitLab %s' % (email, by_email['username']))
            user = by_email
        if 'lease' in self.job and expected is not None and (not positive_id(expected) or not user or user['id'] != expected):
            raise StepError('Учётка GitLab не совпадает с ID, сохранённым в LMS')
        return user

    def gitlab_user(self):
        username, email = self.job['username'], self.job['email'].lower()
        auto = automatic_account(self.job)
        user = self.existing_gitlab_user(username, email)
        created = False
        if not user:
            try:
                user = gl('POST', '/users', {
                    'username': username, 'email': email, 'name': '%s %s' % (self.job['firstName'], self.job['lastName']),
                    'skip_confirmation': True, 'reset_password': True, 'projects_limit': 0, 'can_create_group': False,
                })
                created = True
            except GitLabError as error:
                # Два курса могут одновременно готовить доступ одному ученику.
                if not auto or error.status not in (400, 409, 422):
                    raise
                user = self.existing_gitlab_user(username, email)
                if not user:
                    raise

        user = verified_student_account(user, email, self.job.get('graderUserId'))
        self.user = user
        self.extra['gitlabUserId'] = user['id']
        return 'done', ('создана, GitLab отправил письмо со ссылкой для пароля' if created
                        else 'учётка уже была (%s), письмо не отправлялось' % user.get('state'))

    def gitlab_project(self):
        group, username = self.job['group'], self.job['username']
        path = '%s/%s' % (group, username)
        project = gl('GET', '/projects/%s' % q(path), allow404=True)
        expected = self.job.get('gitlabProjectId')
        if expected is not None and (not positive_id(expected) or not project or project.get('id') != expected):
            raise StepError('Проект GitLab в этом потоке не совпадает с ID зачисления в LMS')
        if project and project.get('path_with_namespace') != path:
            raise StepError('Путь проекта GitLab не совпадает с зачислением в LMS')
        if project and project.get('visibility') != 'private':
            raise StepError('Для выдачи нужен приватный учебный проект GitLab')
        mass = 'lease' not in self.job
        marker = '[LMS bootcamp enrollment %s]' % self.job['id']
        marked = mass and project and (project.get('description') or '').endswith(marker)
        recovering = marked and (expected or project.get('forked_from_project'))
        if mass and project and not expected and not recovering:
            # Знакомый путь и даже членство ученика встречаются в его личных проектах.
            raise StepError('Проект с таким путем уже существует, его связь с зачислением не подтверждена')
        completed = self.steps.get('gitlab_project', {}).get('state') == 'done'
        incomplete = recovering and not completed and (project.get('forked_from_project') or differing_settings(project))
        if project and not incomplete:
            notes = ['проект уже был']
            self.project = project
        else:
            course = gl('GET', '/projects/%s' % q(self.job['courseProject']))
            course_main = gl('GET', '/projects/%s/repository/branches/main' % course['id'])['commit']
            description = 'Проект ученика: %s %s' % (self.job['firstName'], self.job['lastName'])
            fork = project or gl('POST', '/projects/%s/fork' % course['id'], {
                'namespace_path': group, 'path': username, 'name': username, 'visibility': 'private',
                'description': description + ('\n' + marker if mass else ''),
            })
            if mass and not expected:
                if not positive_id(fork.get('id')) or fork.get('path_with_namespace') != path:
                    raise StepError('GitLab вернул другой проект при создании копии')
                if project and project['forked_from_project'].get('id') != course['id']:
                    raise StepError('Проект скопирован из другого источника')
                # ID нужен для отзыва, даже если процесс прервется во время импорта.
                self.extra['gitlabProjectId'] = fork['id']
                self.report()
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
            source = state.get('forked_from_project')
            if source and source.get('id') != course['id']:
                raise StepError('Проект скопирован из другого источника')
            main = gl('GET', '/projects/%s/repository/branches/main' % fork['id'])['commit']
            if main['id'] != course_main['id']:
                raise StepError('main проекта %s, а у курса %s' % (main['short_id'], course_main['short_id']))
            if source or not project:
                gl('DELETE', '/projects/%s/fork' % fork['id'])
            project = gl('PUT', '/projects/%s' % fork['id'], PROJECT_SETTINGS)
            differs = differing_settings(project)
            if differs or project.get('forked_from_project'):
                raise StepError('Настройки проекта не применились: %s' % (', '.join(differs) or 'связь форка'))
            self.project = project
            notes = ['создан из %s на %s' % (self.job['courseProject'], course_main['short_id'])]
        if self.project.get('path_with_namespace') != path:
            raise StepError('Найденный проект не совпадает с заданием LMS')
        if differing_settings(self.project) or self.project.get('forked_from_project'):
            raise StepError('Проверьте приватность учебного проекта, настройки CI и связь со стартером')
        self.extra['gitlabProjectId'] = self.project['id']
        self.extra['gitlabProjectUrl'] = self.project['web_url']
        return 'done', ', '.join(notes)

    def gitlab_protect(self):
        pid = self.project['id']
        protection = gl('GET', '/projects/%s/protected_branches/main' % pid, allow404=True)
        if protection and not usual_protection(protection):
            raise StepError('У main нестандартные правила защиты. Выдача доступа остановлена.')
        if not protection:
            gl('POST', '/projects/%s/protected_branches' % pid, {'name': 'main', 'push_access_level': MAINTAINER, 'merge_access_level': MAINTAINER, 'allow_force_push': False})
        branch = gl('GET', '/projects/%s/repository/branches/main' % pid)
        if branch.get('protected') is not True or branch.get('developers_can_push') is not False or branch.get('developers_can_merge') is not False:
            raise StepError('Проверьте защиту main: ученик не должен менять или сливать код в нее напрямую')
        return 'done', 'защита уже стояла' if protection else 'push и слияние только у наставника'

    def gitlab_member(self):
        pid, uid = self.project['id'], self.user['id']
        effective = gl('GET', '/projects/%s/members/all/%s' % (pid, uid), allow404=True)
        member = gl('GET', '/projects/%s/members/%s' % (pid, uid), allow404=True)
        if effective and (not member or effective.get('access_level') != DEVELOPER):
            raise StepError('Учётка уже имеет унаследованный или расширенный доступ к проекту')
        if member:
            if member.get('access_level') == DEVELOPER and member.get('id') == uid:
                return 'done', 'роль уже была'
            raise StepError('У ученика уже назначена другая роль в проекте')
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


def remove_project_member(item):
    mentoring = 'lease' in item
    pid, uid = item.get('gitlabProjectId'), item.get('gitlabUserId')
    path_known = mentoring or 'group' in item
    expected_path = '%s/%s' % (item.get('group'), item['username']) if path_known else None
    if not mentoring and path_known and (pid is None or uid is None):
        if (pid is not None and not positive_id(pid)) or (uid is not None and not positive_id(uid)):
            raise StepError('Неверный ID в задании на отзыв доступа')
        project = gl('GET', '/projects/%s' % (pid or q(expected_path)), allow404=True)
        if project is None:
            return
        found = project.get('id')
        if not positive_id(found) or (pid is not None and pid != found) or project.get('path_with_namespace') != expected_path:
            raise StepError('Учебный проект GitLab не совпадает с заданием на отзыв доступа')
        if uid and not gl('GET', '/projects/%s/members/all/%s' % (found, uid), allow404=True):
            return
        raise StepError('Нужна сверка доступа: для существующего проекта в LMS не сохранены оба ID')
    if pid is None and not mentoring:
        # Выдача буткемпа могла остановиться после создания учетки и до создания проекта.
        return
    if not positive_id(pid) or not positive_id(uid):
        raise StepError('Для отзыва доступа нужны сохранённые ID проекта и ученика в GitLab')
    user = gl('GET', '/users/%s' % uid, allow404=True)
    if user is None:
        return
    if user.get('id') != uid:
        raise StepError('ID учётки GitLab не совпадает с заданием на отзыв доступа')
    if not path_known and user.get('username') != item['username']:
        raise StepError('Логин не совпадает с учёткой GitLab из задания')
    project = gl('GET', '/projects/%s' % pid, allow404=True)
    if project is None:
        return
    if project.get('id') != pid:
        raise StepError('ID проекта GitLab не совпадает с заданием на отзыв доступа')
    if path_known:
        if project.get('path_with_namespace') != expected_path:
            raise StepError('Учебный проект GitLab не совпадает с заданием на отзыв доступа')
    direct = '/projects/%s/members/%s' % (pid, uid)
    gl('DELETE', direct, allow404=True)
    if gl('GET', '/projects/%s/members/all/%s' % (pid, uid), allow404=True):
        raise StepError('К проекту остался доступ через группу GitLab')


def revoke_gitlab(items):
    for item in items:
        path = '/api/internal/bootcamp-enrollments/%s/revoked' % item['id']
        response = {'revision': item['revision']} if 'revision' in item else {}
        try:
            remove_project_member(item)
            lms('POST', path, dict(response, ok=True))
        except StepError as error:
            log('возврат %s: %s' % (item['id'], error))
            lms('POST', path, dict(response, error=str(error)))


def tutoring_job(claim):
    job = claim.get('job')
    if not job:
        return
    worker = Job(job, claim.get('webhook'))
    if job.get('revoke'):
        try:
            remove_project_member(job)
        except StepError as error:
            worker.report('revoke_failed', str(error))
            return
        worker.report('revoked')
    else:
        worker.run()


def main():
    log('исполнитель зачислений запущен, LMS %s' % LMS_URL)
    last_watch = 0.0
    while True:
        try:
            claim = lms('POST', '/api/internal/bootcamp-enrollments/claim')
            if claim.get('revoke'):
                revoke_gitlab(claim['revoke'])
            if claim.get('job'):
                Job(claim['job'], claim.get('webhook')).run()
            mentoring = lms('POST', '/api/internal/tutoring-projects/claim')
            tutoring_job(mentoring)
            if claim.get('job') or mentoring.get('job'):
                continue
            if time.time() - last_watch >= WATCH_EVERY_SECONDS:
                last_watch = time.time()
                check_first_sign_in(claim.get('watch') or [])
        except Exception as error:  # noqa: BLE001 - цикл не должен падать; задание вернётся в очередь по истечении аренды
            log('ошибка цикла: %s' % error)
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    main()
