import os
import sys
import json

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

from app.web import _domain_distribution_meta, _public_domain_enabled, mask_config_value


class DummyConfig:
    def __init__(self, value):
        self.value = value


class DummyQuery:
    def __init__(self, value):
        self.value = value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        if self.value is None:
            return None
        return DummyConfig(self.value)


class DummyDB:
    def __init__(self, value):
        self.value = value

    def query(self, model):
        return DummyQuery(self.value)


def test_domain_distribution_defaults_to_enabled():
    meta = _domain_distribution_meta(DummyDB(None), 'ccocc.cyou')
    assert meta['paused'] is False
    assert meta['distribution_enabled'] is True
    assert _public_domain_enabled(meta) is True


def test_domain_distribution_pause_blocks_public_registration():
    payload = json.dumps({'paused': True, 'reason': '风控暂停'}, ensure_ascii=False)
    meta = _domain_distribution_meta(DummyDB(payload), 'ccocc.cyou')
    assert meta['paused'] is True
    assert meta['distribution_enabled'] is False
    assert meta['pause_reason'] == '风控暂停'
    assert _public_domain_enabled(meta) is False


def test_nicnames_credentials_mask_placeholder_is_secret():
    assert mask_config_value('nicnames_credentials', '{"email":"a","password":"b"}') == '[已隐藏]'
