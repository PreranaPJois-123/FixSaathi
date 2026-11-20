"""Every provider failure maps to a specific, safe category. Uses the SDK's real error classes."""
import asyncio
import httpx, pytest
from google.genai import errors
from app.config import get_settings
from app.integrations.gemini.client import GeminiClient
from app.integrations.gemini.errors import classify


def api(code, status, msg, details=None):
    cls = errors.ClientError if code < 500 else errors.ServerError
    return cls(code, {'error': {'code': code, 'status': status, 'message': msg, 'details': details or []}})


@pytest.mark.parametrize('exc,expected,retry', [
    (api(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', [{'reason': 'API_KEY_INVALID'}]), 'INVALID_API_KEY', False),
    (api(400, 'INVALID_ARGUMENT', 'Invalid JSON payload received.'), 'INVALID_REQUEST', False),
    (api(400, 'FAILED_PRECONDITION', 'User location is not supported for the API use.'), 'REGION_NOT_SUPPORTED', False),
    (api(403, 'PERMISSION_DENIED', 'Generative Language API has not been used in project 123 before or it is disabled.'), 'PERMISSION_DENIED', False),
    (api(404, 'NOT_FOUND', 'models/gemini-9 is not found for API version v1beta'), 'MODEL_NOT_FOUND', False),
    (api(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded for metric generate_content_free_tier_requests, limit: 0'), 'BILLING_REQUIRED', False),
    (api(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).'), 'QUOTA_EXCEEDED', True),
    (api(503, 'UNAVAILABLE', 'The model is overloaded.'), 'PROVIDER_UNAVAILABLE', True),
    (asyncio.TimeoutError(), 'AI_TIMEOUT', True),
    (httpx.ConnectError('dns failure'), 'NETWORK_ERROR', True),
    (ValueError('boom'), 'AI_INTERNAL_ERROR', False),
])
def test_classify(exc, expected, retry):
    c = classify(exc, 'gemini-x')
    assert c.code == expected and c.retryable is retry and c.message and c.hint


def test_key_never_leaks_into_messages():
    c = classify(api(400, 'INVALID_ARGUMENT', 'API key not valid: ' + 'AIza' + 'Sy' + 'X' * 33 + ' key=abc'))
    assert 'AIza' not in (c.provider_message or '') and 'key=abc' not in (c.provider_message or '')


def test_no_retry_on_bad_key_and_bounded_retry_on_outage(monkeypatch):
    calls = {'n': 0}

    async def bad_key():
        calls['n'] += 1; raise api(400, 'INVALID_ARGUMENT', 'API key not valid.')

    async def outage():
        calls['n'] += 1; raise api(503, 'UNAVAILABLE', 'overloaded')
    monkeypatch.setenv('GEMINI_MAX_RETRIES', '2'); get_settings.cache_clear()
    monkeypatch.setattr('app.integrations.gemini.client.asyncio.sleep', lambda *_: _noop())
    g = GeminiClient(client=object())
    with pytest.raises(Exception) as e:
        asyncio.run(g._call('t', 'm', bad_key))
    assert e.value.code == 'INVALID_API_KEY' and calls['n'] == 1
    calls['n'] = 0
    with pytest.raises(Exception) as e:
        asyncio.run(g._call('t', 'm', outage))
    assert e.value.code == 'PROVIDER_UNAVAILABLE' and calls['n'] == 3


async def _noop():
    return None


def test_key_whitespace_and_quotes_stripped(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', '  "abc123"\n'); monkeypatch.setenv('GEMINI_AGENT_MODEL', ' gemini-3.6-flash '); get_settings.cache_clear()
    s = get_settings()
    assert s.gemini_api_key == 'abc123' and s.gemini_agent_model == 'gemini-3.6-flash'


def test_chat_surfaces_specific_reason(client, tech, session_id, fake):
    from app.core.exceptions import AIUnavailable
    fake.fail['chat'] = AIUnavailable('The server\'s Gemini API key is invalid, expired or revoked.', code='INVALID_API_KEY', details={'hint': 'Create a new key', 'provider_status': 'INVALID_ARGUMENT'})
    r = client.post(f'/api/v1/sessions/{session_id}/messages', json={'text': 'fan hums'}, headers=tech['h']).json()
    assert r['ai_status'] == 'unavailable' and r['ai_error']['code'] == 'INVALID_API_KEY' and r['ai_error']['hint'] == 'Create a new key'


def test_blocked_and_empty_responses():
    class C:  # minimal response shapes
        def __init__(self, text=None, block=None, finish=None):
            self.text = text; self.prompt_feedback = type('F', (), {'block_reason': block})() if block else None
            self.candidates = [type('Cand', (), {'finish_reason': finish})()] if finish or text else []
    with pytest.raises(Exception) as e:
        GeminiClient._text_or_raise(C(block='SAFETY'), 'chat')
    assert e.value.code == 'AI_BLOCKED'
    with pytest.raises(Exception) as e:
        GeminiClient._text_or_raise(C(finish='MAX_TOKENS'), 'chat')
    assert e.value.code == 'AI_EMPTY'
    assert GeminiClient._text_or_raise(C(text=' OK '), 'chat') == 'OK'


def test_ai_status_endpoint_has_no_secret(client, tech, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'super-secret-value-1234567890'); get_settings.cache_clear()
    r = client.get('/api/v1/ai/status', headers=tech['h'])
    assert r.status_code == 200 and r.json()['configured'] is True and 'super-secret' not in r.text


def test_free_tier_rate_limit_is_quota_not_billing():
    from google.genai import errors as ge
    from app.integrations.gemini.errors import classify
    rl = ge.ClientError(429, {'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED', 'message':
         'You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 10. Please retry in 7.5s.'}})
    c = classify(rl, 'm'); assert c.code == 'QUOTA_EXCEEDED' and c.retryable and c.retry_after == 7.5
    zero = ge.ClientError(429, {'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED', 'message':
           'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0'}})
    assert classify(zero, 'm').code == 'BILLING_REQUIRED'


def test_agent_falls_back_to_next_model_on_rate_limit(monkeypatch):
    import asyncio
    from google.genai import errors as ge
    from app.config import get_settings
    from app.integrations.gemini.client import GeminiClient
    s = get_settings()
    monkeypatch.setattr(s, 'gemini_api_key', 'test'); monkeypatch.setattr(s, 'gemini_agent_model', 'primary')
    monkeypatch.setattr(s, 'gemini_agent_fallback_models', 'backup'); monkeypatch.setattr(s, 'gemini_max_retries', 0)
    monkeypatch.setattr(s, 'gemini_thinking_level', 'low')
    used = []

    class Resp:
        text = 'ok'; candidates = [object()]; prompt_feedback = None; usage_metadata = None

    class Models:
        async def generate_content(self, model, contents, config):
            used.append((model, config.thinking_config.thinking_level if config.thinking_config else None))
            if model == 'primary':
                raise ge.ClientError(429, {'error': {'code': 429, 'status': 'RESOURCE_EXHAUSTED', 'message': 'free_tier_requests, limit: 10'}})
            return Resp()

    g = GeminiClient()
    g._client = type('C', (), {'aio': type('A', (), {'models': Models()})()})()
    text, meta = asyncio.run(g.generate_text('chat', 'hi', 'sys'))
    assert text == 'ok' and meta.model == 'backup' and [u[0] for u in used] == ['primary', 'backup'] and used[0][1] is not None
