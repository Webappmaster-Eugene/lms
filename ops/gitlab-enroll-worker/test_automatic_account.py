import importlib.util
import unittest
from pathlib import Path
from unittest.mock import mock_open, patch
from urllib.parse import parse_qs, urlsplit


spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('lms-gitlab-worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def example_user(**overrides):
    return dict({'id': 42, 'username': 'personal', 'email': 'learner@example.test', 'state': 'active',
                 'locked': False, 'is_admin': False, 'bot': False, 'confirmed_at': '2026-01-01'}, **overrides)


class UsersAPI:
    def __init__(self, users=()):
        self.users = list(users)
        self.created = []

    def __call__(self, method, path, body=None, allow404=False):
        route = urlsplit(path)
        if method == 'GET' and route.path.startswith('/users/'):
            assert allow404
            return next((user for user in self.users if route.path == '/users/%s' % user['id']), None)
        assert route.path == '/users'
        if method == 'POST':
            self.created.append(body)
            user = example_user(id=999, username=body['username'], email=body['email'])
            self.users.append(user)
            return user
        assert method == 'GET'
        query = parse_qs(route.query)
        if 'username' in query:
            return [user for user in self.users if user['username'] == query['username'][0]
                    and not ('humans' in query and user.get('bot'))]
        page = int(query['page'][0])
        return self.users[(page - 1) * 100:page * 100]


def job(**overrides):
    return worker.Job(dict({'id': 1, 'lease': 'test', 'autoResolveUsername': True, 'username': 'mc-student-7',
                            'email': 'Learner@example.test', 'firstName': 'Тест', 'lastName': 'Ученик',
                            'graderUserId': 33}, **overrides), None)


class AutomaticAccountTest(unittest.TestCase):
    def test_first_enrollment_sends_one_password_setup_link_even_after_retry(self):
        api = UsersAPI()
        with patch.object(worker, 'gl', api):
            first = job()
            first.gitlab_user()
            retry = job(gitlabUserId=first.extra['gitlabUserId'])
            retry.gitlab_user()
        self.assertEqual(first.extra['gitlabUserId'], retry.extra['gitlabUserId'])
        self.assertEqual(api.created, [{'username': 'mc-student-7', 'email': 'learner@example.test',
                                       'name': 'Тест Ученик', 'skip_confirmation': True, 'reset_password': True,
                                       'projects_limit': 0, 'can_create_group': False}])

    def test_reuses_confirmed_primary_email_even_behind_search_results_and_after_rename(self):
        other_users = [example_user(id=i + 1000, username='other-%d' % i, email='other@example.test') for i in range(100)]
        api = UsersAPI([*other_users, example_user(email='LEARNER@example.test')])
        with patch.object(worker, 'gl', api):
            first = job()
            first.gitlab_user()
            self.assertEqual(first.job['username'], 'mc-student-7')
            api.users[-1]['username'] = 'renamed'
            retry = job(gitlabUserId=42)
            retry.gitlab_user()
        self.assertEqual(retry.user['username'], 'renamed')
        self.assertEqual(first.extra, {'gitlabUserId': 42})
        self.assertEqual(api.created, [])

    def test_conflicts_and_ineligible_accounts_stop_before_grant_or_password_email(self):
        cases = [
            ([example_user(username='mc-student-7', email='other@example.test'), example_user()], {}),
            ([example_user(is_admin=True)], {}),
            ([example_user(is_auditor=True)], {}),
            ([example_user(bot=True)], {}),
            ([example_user(state='blocked')], {}),
            ([example_user(locked=True)], {}),
            ([example_user(confirmed_at=None)], {}),
            ([example_user(id=33)], {}),
            ([example_user(), example_user(id=3)], {}),
            ([example_user()], {'gitlabUserId': 200}),
            ([], {'gitlabUserId': 42}),
            ([example_user(username='mc-student-7', email='other@example.test', public_email='learner@example.test')], {}),
        ]
        for users, args in cases:
            with self.subTest(users=users, args=args):
                api = UsersAPI(users)
                with patch.object(worker, 'gl', api), self.assertRaises(worker.StepError):
                    job(**args).gitlab_user()
                self.assertEqual(api.created, [])

    def test_parallel_enrollment_rechecks_the_account_after_unique_conflict(self):
        api = UsersAPI()

        def concurrent_creation(method, path, body=None):
            if method == 'POST':
                api.users.append(example_user(username='mc-student-7'))
                raise worker.GitLabError(409, 'Почта уже занята')
            return api(method, path, body)

        with patch.object(worker, 'gl', concurrent_creation):
            task = job()
            task.gitlab_user()
        self.assertEqual(task.extra, {'gitlabUserId': 42})
        self.assertEqual(api.created, [])

    def test_public_email_alone_cannot_link_an_existing_account(self):
        api = UsersAPI([example_user(email='another@example.test', public_email='learner@example.test')])

        def existing_secondary(method, path, body=None):
            if method == 'POST':
                raise worker.GitLabError(400, 'Почта уже занята')
            return api(method, path, body)

        task = job()
        with patch.object(worker, 'gl', existing_secondary), self.assertRaises(worker.GitLabError):
            task.gitlab_user()
        self.assertIsNone(task.user)
        self.assertEqual(task.extra, {})

    def test_manual_job_still_requires_the_same_username_and_email(self):
        api = UsersAPI([example_user()])
        task = job(autoResolveUsername=False)
        with patch.object(worker, 'gl', api), self.assertRaises(worker.StepError):
            task.gitlab_user()
        self.assertEqual(api.created, [])

    def test_historical_mentoring_login_requires_a_verified_personal_account(self):
        for fields in ({'confirmed_at': None}, {'locked': True}, {'state': 'blocked'}, {'is_auditor': True},
                       {'is_admin': True}, {'bot': True}, {'id': 33}):
            with self.subTest(fields=fields):
                api = UsersAPI([example_user(username='former-bootcamp-user', **fields)])
                task = job(autoResolveUsername=False, username='former-bootcamp-user')
                with patch.object(worker, 'gl', api), self.assertRaises(worker.StepError):
                    task.gitlab_user()
                self.assertIsNone(task.user)
                self.assertEqual(api.created, [])

    def test_missing_or_replaced_historical_account_does_not_trigger_creation(self):
        for users in ([], [example_user(id=99)]):
            with self.subTest(users=users):
                api = UsersAPI(users)
                with patch.object(worker, 'gl', api), self.assertRaises(worker.StepError):
                    job(autoResolveUsername=False, username='personal', gitlabUserId=42).gitlab_user()
                self.assertEqual(api.created, [])

    def test_revocation_uses_recorded_ids_and_checks_the_project_path(self):
        task = job(gitlabUserId=42, gitlabProjectId=11, group='mentoring').job
        for path in ('another/project', 'mentoring/mc-student-7'):
            with self.subTest(path=path), patch.object(worker, 'gl') as gl:
                gl.side_effect = [example_user(username='new-name'), {'id': 11, 'path_with_namespace': path}, None, None]
                if path == 'another/project':
                    with self.assertRaises(worker.StepError):
                        worker.remove_project_member(task)
                else:
                    worker.remove_project_member(task)
                writes = [call.args for call in gl.call_args_list if call.args[0] != 'GET']
                self.assertEqual(writes, [('DELETE', '/projects/11/members/42')] if path == 'mentoring/mc-student-7' else [])

    def test_historical_login_renamed_or_reassigned_revokes_only_the_recorded_id_in_the_original_project(self):
        task = job(autoResolveUsername=False, username='old-name', gitlabUserId=42, gitlabProjectId=11, group='mentoring').job
        with patch.object(worker, 'gl') as gl:
            gl.side_effect = [example_user(username='renamed'), {'id': 11, 'path_with_namespace': 'mentoring/old-name'}, None, None]
            worker.remove_project_member(task)
            self.assertEqual([call.args for call in gl.call_args_list], [
                ('GET', '/users/42'), ('GET', '/projects/11'), ('DELETE', '/projects/11/members/42'),
                ('GET', '/projects/11/members/all/42'),
            ])
            self.assertTrue(gl.call_args_list[2].kwargs['allow404'])

    def test_historical_login_does_not_revoke_outside_the_assigned_project(self):
        task = job(autoResolveUsername=False, username='old-name', gitlabUserId=42, gitlabProjectId=11, group='mentoring').job
        for project in ({'id': 11, 'path_with_namespace': 'bootcamp/old-name'},
                        {'id': 12, 'path_with_namespace': 'mentoring/old-name'}):
            with self.subTest(project=project), patch.object(worker, 'gl') as gl:
                gl.side_effect = [example_user(username='renamed'), project]
                with self.assertRaises(worker.StepError):
                    worker.remove_project_member(task)
                self.assertTrue(all(call.args[0] == 'GET' for call in gl.call_args_list))

    def test_invalid_mentoring_ids_are_rejected_before_revocation(self):
        for pid, uid in ((None, 42), (11, 0), (True, 42), ('11', 42)):
            with self.subTest(pid=pid, uid=uid), patch.object(worker, 'gl') as gl:
                with self.assertRaises(worker.StepError):
                    worker.remove_project_member(job(autoResolveUsername=False, gitlabProjectId=pid, gitlabUserId=uid).job)
                gl.assert_not_called()

    def test_historical_login_with_remaining_group_access_reports_a_failed_revocation(self):
        task = job(autoResolveUsername=False, username='old-name', gitlabUserId=42, gitlabProjectId=11, group='mentoring').job
        with patch.object(worker, 'gl') as gl:
            gl.side_effect = [example_user(username='renamed'), {'id': 11, 'path_with_namespace': 'mentoring/old-name'},
                              None, {'id': 42, 'access_level': worker.DEVELOPER}]
            with self.assertRaises(worker.StepError):
                worker.remove_project_member(task)
            self.assertEqual(gl.call_args.args, ('GET', '/projects/11/members/all/42'))

    def test_bootcamp_revocation_still_checks_the_username(self):
        with patch.object(worker, 'gl', return_value=example_user(username='renamed')) as gl:
            with self.assertRaises(worker.StepError):
                worker.remove_project_member({'username': 'old-name', 'gitlabUserId': 42, 'gitlabProjectId': 11})
            self.assertEqual([call.args for call in gl.call_args_list], [('GET', '/users/42')])


class PaidBootcampAccountTest(unittest.TestCase):
    def course(self, **overrides):
        return worker.Job(dict({'id': 17, 'email': 'learner@example.test', 'username': 'course-project',
                                'firstName': 'Тест', 'lastName': 'Ученик', 'group': 'cohort-two',
                                'courseProject': 'bootcamp/course'}, **overrides), None)

    def test_protocol_is_advertised_only_at_enrollment_claim(self):
        with patch('builtins.open', mock_open(read_data='test-key')), patch.object(worker, 'http', return_value=(200, {})) as api:
            worker.lms('POST', '/api/internal/bootcamp-enrollments/claim')
            self.assertEqual(api.call_args.args[2]['x-lms-enrollment-protocol'], '2')
            worker.lms('POST', '/api/internal/tutoring-projects/claim')
            self.assertNotIn('x-lms-enrollment-protocol', api.call_args.args[2])

    def test_second_course_reuses_known_personal_account_after_rename(self):
        api = UsersAPI([example_user(username='new-name')])
        task = self.course(gitlabUserId=42)
        with patch.object(worker, 'gl', api):
            task.gitlab_user()
        self.assertEqual(task.user['username'], 'new-name')
        self.assertEqual(task.extra['gitlabUserId'], 42)
        self.assertEqual(api.created, [])

    def test_matching_email_alone_cannot_attach_an_unlinked_mass_account(self):
        api = UsersAPI([example_user()])
        with patch.object(worker, 'gl', api), self.assertRaises(worker.StepError):
            self.course().gitlab_user()
        self.assertEqual(api.created, [])

    def test_bound_account_is_exact_confirmed_active_human(self):
        for fields in ({'id': 41}, {'email': 'other@example.test'}, {'confirmed_at': None}, {'is_admin': True},
                       {'locked': True}, {'state': 'blocked'}, {'bot': True}, {'is_auditor': True}):
            with self.subTest(fields=fields):
                api = UsersAPI([example_user(**fields)])
                task = self.course(gitlabUserId=42)
                with patch.object(worker, 'gl', api), self.assertRaises(worker.StepError):
                    task.gitlab_user()
                self.assertEqual(task.extra, {})
                self.assertEqual(api.created, [])

    def test_project_from_another_course_cannot_be_adopted(self):
        project = {'id': 60, 'path_with_namespace': 'cohort-two/course-project', 'visibility': 'private'}
        for bound, responses in [(61, [project]), (None, [project]), (60, [None])]:
            with self.subTest(bound=bound, responses=responses), patch.object(worker, 'gl') as api:
                api.side_effect = responses
                task = self.course(gitlabUserId=42, gitlabProjectId=bound)
                task.user = example_user()
                with self.assertRaises(worker.StepError):
                    task.gitlab_project()
                self.assertTrue(all(call.args[0] == 'GET' for call in api.call_args_list))

    def test_running_again_after_fork_resumes_the_same_project(self):
        project = {'id': 60, 'path_with_namespace': 'cohort-two/course-project', 'visibility': 'private',
                   'web_url': 'https://git.example.test/cohort-two/course-project',
                   'description': 'Тест\n[LMS bootcamp enrollment 17]', 'forked_from_project': {'id': 7}}
        main = {'commit': {'id': 'ab', 'short_id': 'ab'}}
        ready = dict(project, **worker.PROJECT_SETTINGS)
        ready.pop('forked_from_project')
        with patch.object(worker, 'gl') as api, patch.object(worker, 'lms') as report:
            api.side_effect = [project, {'id': 7}, main, dict(project, import_status='finished'), main, None, ready]
            task = self.course(gitlabUserId=42)
            task.gitlab_project()
            self.assertEqual(task.extra['gitlabProjectId'], 60)
            self.assertEqual(report.call_args.args[2]['gitlabProjectId'], 60)
            self.assertEqual([c.args[:2] for c in api.call_args_list if c.args[0] != 'GET'],
                             [('DELETE', '/projects/60/fork'), ('PUT', '/projects/60')])

    def test_interrupted_enrollment_checks_project_even_without_saved_ids(self):
        project = {'id': 70, 'path_with_namespace': 'cohort-two/course-project'}
        cases = [
            (None, None, [None], True),
            (70, None, [None], True),
            (None, 42, [project, None], True),
            (None, 42, [project, {'id': 42}], False),
            (None, None, [project], False),
            (70, None, [project], False),
            (70, None, [dict(project, id=71)], False),
        ]
        for pid, uid, responses, revoke_done in cases:
            with self.subTest(pid=pid, uid=uid, responses=responses), patch.object(worker, 'gl') as api:
                api.side_effect = responses
                task = dict(gitlabProjectId=pid, gitlabUserId=uid, username='course-project', group='cohort-two')
                if revoke_done:
                    worker.remove_project_member(task)
                else:
                    with self.assertRaises(worker.StepError):
                        worker.remove_project_member(task)
                expected_path = '/projects/70' if pid else '/projects/cohort-two%2Fcourse-project'
                self.assertEqual(api.call_args_list[0].args, ('GET', expected_path))
                self.assertTrue(all(call.args[0] == 'GET' for call in api.call_args_list))

    def test_public_and_internal_projects_are_rejected_before_any_change(self):
        for visibility in ('public', 'internal'):
            for uid in (None, 42):
                project = dict(worker.PROJECT_SETTINGS, id=60, path_with_namespace='cohort-two/course-project',
                               description='[LMS bootcamp enrollment 17]', visibility=visibility)
                with self.subTest(visibility=visibility, uid=uid), patch.object(worker, 'gl', return_value=project) as api:
                    task = self.course(gitlabUserId=uid)
                    with self.assertRaises(worker.StepError):
                        task.gitlab_project()
                    self.assertEqual([call.args[0] for call in api.call_args_list], ['GET'])

    def test_unsafe_main_is_rejected_for_new_and_reused_accounts(self):
        safe = {'allow_force_push': False, 'push_access_levels': [{'access_level': worker.MAINTAINER}],
                'merge_access_levels': [{'access_level': worker.MAINTAINER}]}
        branch = {'protected': True, 'developers_can_push': False, 'developers_can_merge': False}
        for uid in (None, 42):
            for field in ('push_access_levels', 'merge_access_levels'):
                for rule in ({'access_level': worker.DEVELOPER}, {'access_level': worker.MAINTAINER, 'user_id': 55}):
                    with self.subTest(uid=uid, field=field, rule=rule), patch.object(worker, 'gl', return_value=dict(safe, **{field: [rule]})) as api:
                        task = self.course(gitlabUserId=uid)
                        task.project = {'id': 70}
                        with self.assertRaises(worker.StepError):
                            task.gitlab_protect()
                        self.assertEqual([call.args[0] for call in api.call_args_list], ['GET'])
            for field in ('developers_can_push', 'developers_can_merge'):
                with self.subTest(uid=uid, permission=field), patch.object(worker, 'gl', side_effect=[safe, dict(branch, **{field: True})]) as api:
                    task = self.course(gitlabUserId=uid)
                    task.project = {'id': 70}
                    with self.assertRaises(worker.StepError):
                        task.gitlab_protect()
                    self.assertEqual([call.args[0] for call in api.call_args_list], ['GET', 'GET'])

    def test_revocation_report_matches_the_claim_revision_on_success_and_failure(self):
        for result in (None, worker.StepError('нужна сверка')):
            with self.subTest(result=result), patch.object(worker, 'remove_project_member', side_effect=result), patch.object(worker, 'lms') as lms, patch.object(worker, 'log'):
                worker.revoke_gitlab([{'id': 9, 'revision': '2026-11-25T00:00:00.000Z'}])
                body = lms.call_args.args[2]
                self.assertEqual(body['revision'], '2026-11-25T00:00:00.000Z')
                self.assertEqual(body.get('ok'), None if result else True)
                self.assertEqual(body.get('error'), str(result) if result else None)

    def test_refund_of_one_course_keeps_the_other_membership(self):
        projects = {60: 'cohort-one/course-project', 70: 'cohort-two/course-project'}
        memberships = {60: {42}, 70: {42}}

        def api(method, path, allow404=False):
            parts = path.strip('/').split('/')
            if method == 'GET' and parts == ['users', '42']:
                return example_user(username='renamed')
            self.assertEqual(parts[0], 'projects')
            pid = int(parts[1])
            if method == 'GET' and len(parts) == 2:
                return {'id': pid, 'path_with_namespace': projects[pid]}
            if method == 'DELETE' and parts[2:] == ['members', '42']:
                memberships[pid].discard(42)
                return None
            self.assertEqual((method, parts[2:]), ('GET', ['members', 'all', '42']))
            return {'id': 42} if 42 in memberships[pid] else None

        task = dict(gitlabProjectId=70, gitlabUserId=42, username='course-project', group='cohort-two')
        with patch.object(worker, 'gl', api):
            with self.assertRaises(worker.StepError):
                worker.remove_project_member(dict(task, gitlabProjectId=60))
            worker.remove_project_member(task)
            worker.remove_project_member(task)
        self.assertEqual(memberships, {60: {42}, 70: set()})


if __name__ == '__main__':
    unittest.main()
