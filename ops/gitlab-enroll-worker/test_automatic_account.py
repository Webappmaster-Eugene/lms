import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch
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

    def __call__(self, method, path, body=None):
        route = urlsplit(path)
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


if __name__ == '__main__':
    unittest.main()
