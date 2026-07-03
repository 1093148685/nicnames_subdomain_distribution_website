import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

from fastapi import HTTPException

from app.models import Subdomain
from app.web import (
    _nicnames_record_claims_prefix,
    _nicnames_record_name,
    _validate_subdomain_prefix,
)


def test_root_apex_record_does_not_claim_every_prefix():
    assert not _nicnames_record_claims_prefix({'name': 'ccocc.cyou.', 'type': 'A', 'data': '1.1.1.1'}, 'api', 'ccocc.cyou')


def test_www_record_only_claims_www_prefix():
    assert _nicnames_record_claims_prefix({'name': 'www.ccocc.cyou.', 'type': 'A', 'data': '1.1.1.1'}, 'www', 'ccocc.cyou')
    assert not _nicnames_record_claims_prefix({'name': 'www.ccocc.cyou.', 'type': 'A', 'data': '1.1.1.1'}, 'api', 'ccocc.cyou')


def test_nested_record_claims_top_level_prefix():
    assert _nicnames_record_claims_prefix({'name': 'x.api.ccocc.cyou.', 'type': 'TXT', 'data': 'v'}, 'api', 'ccocc.cyou')


def test_builtin_reserved_prefixes_rejected():
    for prefix in ['www', 'WWW.', 'api', 'admin', '*', '@']:
        try:
            _validate_subdomain_prefix(prefix)
        except HTTPException as exc:
            assert exc.status_code == 400
            assert '保留前缀' in exc.detail or '只能' in exc.detail
        else:
            raise AssertionError(f'{prefix} should be rejected')


def test_regular_prefix_allowed():
    assert _validate_subdomain_prefix('my-shop-123') == 'my-shop-123'


def test_user_record_name_cannot_escape_to_root_or_other_prefix():
    sub = Subdomain(prefix='alice', root_domain='ccocc.cyou', fqdn='alice.ccocc.cyou')
    assert _nicnames_record_name(sub, '@') == 'alice'
    assert _nicnames_record_name(sub, 'blog') == 'blog.alice'
    assert _nicnames_record_name(sub, 'blog.alice.ccocc.cyou') == 'blog.alice'
    for bad in ['ccocc.cyou', 'www.ccocc.cyou', 'api.ccocc.cyou']:
        try:
            _nicnames_record_name(sub, bad)
        except HTTPException as exc:
            assert exc.status_code == 400
        else:
            raise AssertionError(f'{bad} should not be allowed')
