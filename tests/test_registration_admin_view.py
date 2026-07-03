import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

from app.web import _is_allowed_registration_email, admin_subdomain_to_dict


def test_registration_email_only_allows_qq_and_google():
    assert _is_allowed_registration_email('user@qq.com')
    assert _is_allowed_registration_email('user@gmail.com')
    assert _is_allowed_registration_email('user@googlemail.com')
    assert not _is_allowed_registration_email('user@163.com')
    assert not _is_allowed_registration_email('user@example.com')


def test_admin_subdomain_dict_includes_owner_email_and_username():
    owner = SimpleNamespace(id=7, username='tester', email='tester@qq.com')
    sub = SimpleNamespace(
        id=3,
        user_id=7,
        owner=owner,
        prefix='api',
        fqdn='api.ccocc.cyou',
        root_domain='ccocc.cyou',
        records_count=2,
        status='active',
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    data = admin_subdomain_to_dict(sub)
    assert data['domain'] == 'api.ccocc.cyou'
    assert data['owner_username'] == 'tester'
    assert data['owner_email'] == 'tester@qq.com'
    assert data['registered_by'] == 'tester <tester@qq.com>'
