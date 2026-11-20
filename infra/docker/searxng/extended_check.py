"""Retained regression: real processor, coordinator, metrics and suspension.

Run against the built image with --candidate --deployed --isolated-callbacks
--incremental --partial-metric --metric-safety --contention. Historical transform
modes are forbidden here: this check must exercise the imported image code.
"""
import difflib
import json
import logging
import linecache
import pathlib
import sys

assert '--deployed' in sys.argv, 'use --deployed: source-transform experiments are not release tests'
assert '--candidate' in sys.argv, 'use --candidate to enable lifecycle race assertions'
import threading
from timeit import default_timer
from types import SimpleNamespace

from flask import Flask
import searx.engines
import searx.metrics
import searx.results
import searx.search
import searx.search.processors.abstract as abstract


patched = '--candidate' in sys.argv
isolated_callbacks = '--isolated-callbacks' in sys.argv
incremental = '--incremental' in sys.argv
if patched and "--deployed" not in sys.argv:
    for module, name in [(searx.results, 'close'), (abstract, 'extend_container')]:
        path = pathlib.Path(module.__file__)
        original = path.read_text()
        start = original.index('    def ' + name + '(')
        end = original.index('\n    def ', start + 5)
        block = original[start:end]
        lines = block.splitlines()
        body_start = next(i for i, line in enumerate(lines) if line.rstrip().endswith(':')) + 1
        new = lines[:body_start] + ['        with self._lock:' if name == 'close' else '        with result_container._lock:']
        if name == 'close':
            new += ['            if self._closed:', '                return']
        else:
            new += [
                '            if result_container._closed:',
                "                self.handle_exception(result_container, 'timeout', False)",
                '                return',
            ]
        new += ['    ' + line if line else line for line in lines[body_start:]]
        changed = original[:start] + '\n'.join(new) + '\n' + original[end:]
        if isolated_callbacks and module is searx.results:
            begin = changed.index('    def extend(')
            finish = changed.index('\n    def _merge_infobox', begin)
            publish = changed[begin:finish].replace('    def extend(', '    def _publish_results(')
            publish = publish.replace('                result.normalize_result_fields()\n', '')
            publish = publish.replace('self.on_result(result)', 'True')
            prepare = '''    def extend(self, engine_name, results):
        prepared = []
        for result in list(results):
            if isinstance(result, Result):
                result.engine = result.engine or engine_name
            else:
                result["engine"] = result.get("engine") or engine_name or ""
                result = LegacyResult(result)
            result.normalize_result_fields()
            if self.on_result(result):
                prepared.append(result)
        with self._lock:
            if self._closed:
                return
            self._publish_results(engine_name, prepared)

'''
            if incremental:
                publish = publish.replace('results: list[Result | LegacyResult]\n', 'results: list[Result | LegacyResult], main_count=0\n')
                publish = publish.replace('        main_count = 0\n', '')
                metric_start = publish.index('        if engine_name in searx.engines.engines:')
                metrics = publish[metric_start:]
                publish = publish[:metric_start] + '        return main_count\n\n'
                prepare = '''    def extend(self, engine_name, results):
        main_count = 0
        for result in list(results):
            with self._lock:
                if self._closed:
                    return
            if isinstance(result, Result):
                result.engine = result.engine or engine_name
            else:
                result["engine"] = result.get("engine") or engine_name or ""
                result = LegacyResult(result)
            result.normalize_result_fields()
            if not self.on_result(result):
                continue
            with self._lock:
                if self._closed:
                    return
                main_count = self._publish_results(engine_name, [result], main_count)
        with self._lock:
            if self._closed:
                return
'''
                prepare += '\n'.join('    ' + line if line else line for line in metrics.splitlines()) + '\n\n'
                if '--partial-metric' in sys.argv:
                    body = prepare.splitlines()
                    loop_start = body.index('        for result in list(results):')
                    tail_start = next(i for i in range(len(body) - 1, 0, -1) if body[i] == '        with self._lock:')
                    prepare = '\n'.join(body[:loop_start] + ['        try:'] + [
                        '    ' + line if line else line for line in body[loop_start:tail_start]
                    ] + [
                        '        finally:',
                        '            if engine_name in searx.engines.engines:',
                        '                eng = searx.engines.engines[engine_name]',
                        '                histogram_observe(main_count, "engine", eng.name, "result", "count")',
                        '                with self._lock:',
                        '                    if not self._closed and not self.paging and eng.paging:',
                        '                        self.paging = True',
                    ]) + '\n\n'
                    if '--metric-safety' in sys.argv:
                        prepare = prepare.replace('        try:\n', '        functional_error = None\n        try:\n', 1)
                        prepare = prepare.replace(
                            '        finally:\n',
                            '        except BaseException as error:\n'
                            '            functional_error = error\n'
                            '            raise\n'
                            '        finally:\n',
                            1,
                        )
                        prepare = prepare.replace(
                            '        main_count = 0\n',
                            '        with self._lock:\n'
                            '            if self._closed:\n'
                            '                return\n'
                            '        main_count = 0\n',
                            1,
                        )
                        prepare = prepare.replace(
                            '                histogram_observe(main_count, "engine", eng.name, "result", "count")',
                            '                try:\n'
                            '                    histogram_observe(main_count, "engine", eng.name, "result", "count")\n'
                            '                except Exception as telemetry_error:\n'
                            '                    if functional_error is None:\n'
                            '                        raise\n'
                            '                    functional_error.add_note("result-count telemetry failed: " + type(telemetry_error).__name__)\n'
                            '                    try:\n'
                            '                        log.exception("result-count telemetry failed while handling functional failure")\n'
                            '                    finally:\n'
                            '                        raise functional_error',
                        )
            changed = changed[:begin] + prepare + publish + changed[finish:]
        if module is abstract:
            changed = changed.replace(
                '        result_container.add_unresponsive_engine(self.engine.name, error_message)',
                '        with result_container._lock:\n'
                '            if result_container._closed:\n'
                '                self.logger.warning("late engine error after response deadline: %s", error_message)\n'
                '            else:\n'
                '                result_container.add_unresponsive_engine(self.engine.name, error_message)',
            )
            if isolated_callbacks:
                # Keep callbacks outside publication lock; timing and suspension recheck closure.
                changed = changed.replace(
                    '        result_container.extend(self.engine.name, search_results)\n',
                    '        result_container.extend(self.engine.name, search_results)\n'
                    '        with result_container._lock:\n'
                    '            if result_container._closed:\n'
                    '                self.handle_exception(result_container, "timeout", False)\n'
                    '                return\n',
                )
                timing_start = changed.index('        engine_time = default_timer() - start_time')
                timing_end = changed.index('\n    def extend_container(', timing_start)
                changed = changed[:timing_start] + '\n'.join('    ' + line if line else line for line in changed[timing_start:timing_end].splitlines()) + '\n' + changed[timing_end:]
                begin = changed.index('    def extend_container(')
                end = changed.index('\n    def extend_container_if_suspended', begin)
                completion = original[original.index('    def extend_container('):original.index('\n    def extend_container_if_suspended')]
                completion = completion.replace(
                    '            self.suspended_status.resume()',
                    '            with result_container._lock:\n'
                    '                if not result_container._closed:\n'
                    '                    self.suspended_status.resume()',
                )
                changed = changed[:begin] + completion + changed[end:]
        print(''.join(difflib.unified_diff(original.splitlines(True), changed.splitlines(True), fromfile=str(path), tofile=str(path) + '.candidate')))
        # Only this disposable interpreter loads candidate definitions; disk stays unchanged.
        filename = str(path) + '.candidate'
        linecache.cache[filename] = (len(changed), None, changed.splitlines(True), filename)
        exec(compile(changed, filename, 'exec'), module.__dict__)
    # search imported this class before the candidate module reload.
    searx.search.ResultContainer = searx.results.ResultContainer

name = 'offline-fixture'
engine = SimpleNamespace(name=name, display_error_messages=True, timeout=0.02, logger=logging.getLogger(name), paging=False)
searx.engines.engines[name] = engine
searx.metrics.initialize([name])
records = []
thread_errors = []
original_thread_hook = threading.excepthook


def record_thread_error(args):
    thread_errors.append(str(args.exc_value))
    original_thread_hook(args)


threading.excepthook = record_thread_error


class Capture(logging.Handler):
    def emit(self, record):
        records.append(record.getMessage())


logging.getLogger().addHandler(Capture())
searx.results.log.addHandler(Capture())


class Processor(abstract.EngineProcessor):
    engine_type = 'offline'

    def get_params(self, *args):
        return {}

    def search(self, query, params, container, start_time, timeout):
        try:
            assert release.wait(5)
            if query == 'late-success':
                self.extend_container(container, start_time, [])
            else:
                self.handle_exception(container, 'fixture-denied', True)
        finally:
            finished.set()


class OfflineSearch(searx.search.Search):
    def search_external_bang(self):
        return False

    def search_answerers(self):
        return False

    def _get_requests(self):
        return [(name, self.search_query.query, {})], 0.02


processor = Processor(engine)
searx.search.PROCESSORS[name] = processor
app = Flask('processor-check')
checks = []
signature = 'call to ResultContainer.add_unresponsive_engine after ResultContainer.close'

# A normal error must still publish, count, record details and suspend.
before = searx.metrics.counter('engine', name, 'search', 'count', 'error')
container = searx.results.ResultContainer()
processor.handle_exception(container, 'fixture-predeadline', True)
assert len(container.unresponsive_engines) == 1
assert searx.metrics.counter('engine', name, 'search', 'count', 'error') == before + 1
assert processor.suspended_status.is_suspended
assert processor.suspended_status.suspend_reason == 'fixture-predeadline'
checks.append('predeadline_error_preserved')

if isolated_callbacks:
    from searx.result_types import MainResult
    normal = searx.results.ResultContainer()
    calls = []
    normal.on_result = lambda result: calls.append(result.title) or result.title != 'rejected'
    before_success = searx.metrics.counter('engine', name, 'search', 'count', 'successful')
    processor.extend_container(normal, default_timer(), [
        MainResult(url='https://example.invalid/kept', title='kept'),
        MainResult(url='https://example.invalid/rejected', title='rejected'),
    ])
    assert calls == ['kept', 'rejected'], calls
    assert len(normal.main_results_map) == 1
    assert len(normal.timings) == 1
    assert searx.metrics.counter('engine', name, 'search', 'count', 'successful') == before_success + 1
    assert not processor.suspended_status.is_suspended
    checks.append('normal_success_and_callback_rejection')

for scenario in ['late-error', 'late-success']:
    release = threading.Event()
    finished = threading.Event()
    processor.suspended_status.resume()
    before = searx.metrics.counter('engine', name, 'search', 'count', 'error')
    old_late = records.count(signature)
    search = OfflineSearch(SimpleNamespace(query=scenario))
    begin = default_timer()
    try:
        with app.test_request_context('/search?q=fixture'):
            container = search.search()
        elapsed = default_timer() - begin
        assert not finished.is_set(), 'deadline incorrectly waits for blocked worker'
        assert elapsed < 1, elapsed
        assert len(container.unresponsive_engines) == 1
        container.get_ordered_results()
    finally:
        release.set()
        assert finished.wait(5)
    assert len(container.unresponsive_engines) == 1
    assert searx.metrics.counter('engine', name, 'search', 'count', 'error') == before + 1
    if scenario == 'late-error':
        assert processor.suspended_status.is_suspended
        assert processor.suspended_status.suspend_reason == 'fixture-denied'
    if patched:
        assert records.count(signature) == old_late
    else:
        assert records.count(signature) > old_late
    checks.append(scenario)

if patched:
    # Force reporting to queue behind the close lock; it must recheck inside lock.
    container = searx.results.ResultContainer()
    waiting = threading.Event()
    done = threading.Event()
    before = searx.metrics.counter('engine', name, 'search', 'count', 'error')

    def racing_error():
        try:
            waiting.set()
            processor.handle_exception(container, 'fixture-race', True)
        finally:
            done.set()

    with container._lock:
        worker = threading.Thread(target=racing_error)
        worker.start()
        assert waiting.wait(5)
        container.close()
    worker.join(5)
    assert done.is_set()
    assert not container.unresponsive_engines
    assert searx.metrics.counter('engine', name, 'search', 'count', 'error') == before + 1
    assert processor.suspended_status.suspend_reason == 'fixture-race'
    assert signature not in records
    checks.append('close_error_lock_interleaving')

assert searx.metrics.errors_per_engines[name], 'real error recorder must retain detail'
if patched and '--contention' in sys.argv:
    container = searx.results.ResultContainer()
    callback_entered = threading.Event()
    callback_release = threading.Event()
    close_done = threading.Event()
    from searx.result_types import MainResult

    def blocked_callback(result):
        callback_entered.set()
        assert callback_release.wait(5)
        return True

    container.on_result = blocked_callback

    def complete_result():
        processor.extend_container(container, default_timer(), [
            MainResult(url='https://example.invalid/', title='offline fixture'),
        ])

    def finalize():
        container.close()
        close_done.set()

    worker = threading.Thread(target=complete_result)
    worker.start()
    try:
        assert callback_entered.wait(5), 'real result callback not reached'
        closer = threading.Thread(target=finalize)
        closer.start()
        if isolated_callbacks:
            assert close_done.wait(0.1), 'callback still blocks closure'
            assert not container.main_results_map, 'blocked result published early'
            processor.suspended_status.suspend(60, 'concurrent-denied')
        else:
            assert not close_done.wait(0.1), 'expected lock contention not reproduced'
    finally:
        callback_release.set()
        worker.join(5)
        closer.join(5)
    assert close_done.is_set()
    if isolated_callbacks:
        assert not container.main_results_map, 'late callback result published after close'
        assert processor.suspended_status.suspend_reason == 'concurrent-denied', 'late completion cleared suspension'
        assert signature not in records
        print(json.dumps({'candidate': 'isolated-callbacks', 'closure_while_callback_blocked': True, 'late_result_not_published': True}))
    else:
        print(json.dumps({'candidate': 'NO_GO', 'deadline_risk': 'close blocked over100ms by callback with20ms request budget'}))
assert not thread_errors, thread_errors
print(json.dumps({'mode': 'deployed', 'checks': checks, 'result': 'PASS', 'provider_network': 'disabled by container; plugin startup may attempt downloads', 'production_changes': 0}))

# Appended to the processor harness so the same baseline/candidate definitions run.
import urllib.request
from werkzeug.serving import make_server
from searx.result_types import MainResult

parity = searx.results.ResultContainer()
observations = []


def observe(result):
    observations.append({
        'main_count': len(parity.main_results_map),
        'suggestions': sorted(parity.suggestions),
        'corrections': sorted(parity.corrections),
    })
    return True


parity.on_result = observe
parity.extend(name, [
    {'url': 'https://example.invalid/one', 'title': 'legacy one', 'content': 'first'},
    {'suggestion': 'suggested query'},
    {'correction': 'corrected query'},
    {'engine_data': 'payload', 'key': 'fixture-key'},
    {'infobox': 'fixture box', 'id': 'fixture-box', 'content': 'box text'},
])
snapshot = {
    'main_count': len(parity.main_results_map),
    'suggestions': sorted(parity.suggestions),
    'corrections': sorted(parity.corrections),
    'engine_data': dict(parity.engine_data[name]),
    'infobox_count': len(parity.infoboxes),
}
assert snapshot == {
    'main_count': 1,
    'suggestions': ['suggested query'],
    'corrections': ['corrected query'],
    'engine_data': {'fixture-key': 'payload'},
    'infobox_count': 1,
}, snapshot
expected = [
    {'main_count': 0, 'suggestions': [], 'corrections': []},
    {'main_count': 1, 'suggestions': [], 'corrections': []},
    {'main_count': 1, 'suggestions': ['suggested query'], 'corrections': []},
    {'main_count': 1, 'suggestions': ['suggested query'], 'corrections': ['corrected query']},
    {'main_count': 1, 'suggestions': ['suggested query'], 'corrections': ['corrected query']},
]
print(json.dumps({'gate': 'legacy_output_parity', 'result': 'PASS', 'snapshot': snapshot}))
print(json.dumps({'gate': 'callback_observation_parity', 'result': 'PASS' if observations == expected else 'FAIL', 'observed': observations, 'baseline_expected': expected}))

positions = searx.results.ResultContainer()
positions.extend(name, [
    {'url': 'https://example.invalid/position-one', 'title': 'one'},
    {'suggestion': 'between main results'},
    {'url': 'https://example.invalid/position-two', 'title': 'two'},
])
assert sorted(result.positions for result in positions.main_results_map.values()) == [[1], [2]]
print(json.dumps({'gate': 'incremental_main_positions', 'result': 'PASS'}))

http_entered = threading.Event()
http_release = threading.Event()
http_finished = threading.Event()


class HTTPProcessor(Processor):
    def search(self, query, params, container, start_time, timeout):
        def block(result):
            http_entered.set()
            assert http_release.wait(5), 'HTTP callback release missing'
            return True

        container.on_result = block
        try:
            self.extend_container(container, start_time, [
                MainResult(url='https://example.invalid/http', title='blocked HTTP result'),
            ])
        finally:
            http_finished.set()


searx.search.PROCESSORS[name] = HTTPProcessor(engine)
http_app = Flask('coordinator-http-check')
http_container = []


@http_app.get('/search')
def http_search():
    query = OfflineSearch(SimpleNamespace(query='blocked-http'))
    result = query.search()
    http_container.append(result)
    return {'results': len(result.get_ordered_results())}


server = make_server('127.0.0.1', 0, http_app)
server_thread = threading.Thread(target=server.serve_forever)
server_thread.start()
begin = default_timer()
try:
    with urllib.request.urlopen(f'http://127.0.0.1:{server.server_port}/search', timeout=2) as response:
        body = json.load(response)
        elapsed = default_timer() - begin
        assert response.status == 200
    assert http_entered.is_set()
    assert not http_finished.is_set(), 'response waited for callback completion'
    assert body == {'results': 0}, body
    print(json.dumps({'gate': 'loopback_http_blocked_callback', 'status': 200, 'elapsed_ms': round(elapsed * 1000, 3), 'nominal_worker_budget_ms': 20, 'callback_still_blocked': True, 'full_searx_webapp': False}))
finally:
    http_release.set()
    assert http_finished.wait(5)
    server.shutdown()
    server_thread.join(5)
    server.server_close()
assert not thread_errors, thread_errors
if isolated_callbacks:
    assert not http_container[0].main_results_map, 'late HTTP result changed frozen response'
assert observations == expected, 'candidate violates baseline plugin observation order'

import searx.result_types as result_types
import msgspec

subtypes = []
for typename in ['KeyValue', 'Code', 'Paper', 'File', 'Image', 'Video', 'Translations', 'WeatherAnswer']:
    cls = getattr(result_types, typename)
    required = [field.name for field in msgspec.structs.fields(cls) if field.required]
    subtypes.append({'type': typename, 'required_fields': required})
print(json.dumps({'subtype_constructor_contracts': subtypes}))
answer_container = searx.results.ResultContainer()
answer_calls = []
answer_container.on_result = lambda result: answer_calls.append(type(result).__name__) or True
answer_container.extend(name, [result_types.Answer(answer='typed fixture'), {'answer': 'legacy fixture'}])
assert len(answer_container.answers) == 2
assert answer_calls == ['Answer', 'LegacyResult'], answer_calls
print(json.dumps({'gate': 'typed_and_legacy_answer', 'result': 'PASS'}))
typed = searx.results.ResultContainer()
typed.extend(name, [
    result_types.KeyValue(kvmap={'fixture': 'value'}),
    result_types.Code(url='https://example.invalid/code', title='code'),
    result_types.Paper(url='https://example.invalid/paper', title='paper'),
    result_types.File(url='https://example.invalid/file', title='file'),
    result_types.Image(url='https://example.invalid/image', title='image'),
    result_types.Video(url='https://example.invalid/video', title='video'),
    result_types.Translations(translations=[result_types.Translations.Item(text='fixture translation')]),
])
assert len(typed.main_results_map) == 6
assert len(typed.answers) == 1
print(json.dumps({'gate': 'typed_subtypes_except_weather', 'result': 'PASS'}))
import searx.weather as weather
weather_container = searx.results.ResultContainer()
weather_container.extend(name, [result_types.WeatherAnswer(
    current=result_types.WeatherAnswer.Item(
        location=weather.GeoLocation(name='Fixture', latitude=0.0, longitude=0.0, elevation=0.0, country_code='GB', timezone='UTC'),
        temperature=weather.Temperature(val=20.0, unit='°C'),
        condition='clear sky',
        wind_from=weather.Compass(val=0.0),
        summary='Offline weather fixture',
    ),
)])
assert len(weather_container.answers) == 1
print(json.dumps({'gate': 'weather_answer_publication', 'result': 'PASS'}))

from searx import settings
settings['server']['secret_key'] = 'offline-fixture-not-a-production-secret'
settings['server']['limiter'] = False
settings['search']['formats'] = ['html', 'json']
# Explicit offline startup substitution: load actual configured engine metadata,
# but do not initialize provider threads or perform network checks.
initialization_calls = []


def offline_initialize(settings_engines=None, check_network=False, enable_metrics=True):
    initialization_calls.append({'requested_network_check': check_network})
    searx.engines.engines.pop('offline-fixture', None)
    searx.engines.load_engines(settings_engines or settings['engines'])
    searx.metrics.initialize(list(searx.engines.engines), enabled=True)


searx.search.initialize = offline_initialize
import searx.webapp as webapp
import searx.plugins

webapp.locales_initialize()
searx.plugins.initialize(webapp.app)
print(json.dumps({'gate': 'installed_webapp_import_plugins', 'result': 'PASS', 'plugins': settings['plugins']}))
assert initialization_calls == [{'requested_network_check': True}], initialization_calls
print(json.dumps({'startup_substitution': 'real engine metadata loaded, provider thread/network initialization replaced offline', 'initialization_calls': initialization_calls}))
app_entered = threading.Event()
app_release = threading.Event()
app_finished = threading.Event()
app_containers = []
plugin_calls = []


class AppProcessor(Processor):
    def search(self, query, params, container, start_time, timeout):
        plugin_callback = container.on_result
        app_containers.append(container)

        def plugin_then_block(result):
            accepted = plugin_callback(result)
            plugin_calls.append(accepted)
            app_entered.set()
            assert app_release.wait(5)
            return accepted

        container.on_result = plugin_then_block
        try:
            self.extend_container(container, start_time, [
                result_types.MainResult(url='https://example.invalid/app?utm_source=fixture', title='app fixture'),
            ])
        finally:
            app_finished.set()


# Replace external request selection only; actual route, query parser, plugin hooks,
# SearchWithPlugins finalization and JSON serializer remain installed code.
name = next(iter(searx.engines.engines))
engine = searx.engines.engines[name]
searx.search.PROCESSORS[name] = AppProcessor(engine)
searx.metrics.initialize([name])
searx.search.Search._get_requests = lambda self: ([(name, self.search_query.query, {})], 0.02)
app_server = make_server('127.0.0.1', 0, webapp.app)
app_thread = threading.Thread(target=app_server.serve_forever)
app_thread.start()
begin = default_timer()
try:
    with urllib.request.urlopen(f'http://127.0.0.1:{app_server.server_port}/search?q=fixture&format=json', timeout=2) as response:
        data = json.load(response)
        elapsed = default_timer() - begin
        assert response.status == 200
    assert app_entered.is_set(), 'real plugin callback not reached'
    assert plugin_calls, 'installed plugin hook not invoked'
    assert not app_finished.is_set(), 'HTTP response waited for blocked callback'
    assert data['results'] == []
    print(json.dumps({'gate': 'installed_webapp_blocked_callback', 'status': 200, 'elapsed_ms': round(elapsed * 1000, 3), 'worker_budget_ms': 20, 'callback_still_blocked': True, 'plugin_hook_invoked': True, 'external_request_selection': 'offline fixture'}))
finally:
    app_release.set()
    try:
        worker_finished = app_finished.wait(5) if app_entered.is_set() else False
    finally:
        app_server.shutdown()
        app_thread.join(5)
        app_server.server_close()
    assert worker_finished, 'application fixture worker was not reached or failed to finish'
assert not thread_errors, thread_errors
if isolated_callbacks:
    assert not app_containers[0].main_results_map

partial = searx.results.ResultContainer()
partial_calls = []
result_histogram = searx.metrics.histogram('engine', name, 'result', 'count')
count_before = result_histogram.count
sum_before = result_histogram.sum


def close_second(result):
    partial_calls.append(result.title)
    if result.title == 'second':
        partial.close()
    return True


partial.on_result = close_second
partial.extend(name, [
    MainResult(url='https://example.invalid/partial-first', title='first'),
    MainResult(url='https://example.invalid/partial-second', title='second'),
])
assert partial_calls == ['first', 'second']
assert len(partial.main_results_map) == 1
assert result_histogram.count == count_before + 1, 'partial batch must emit result-count histogram exactly once'
assert result_histogram.sum == sum_before + 1, 'partial batch histogram must count only published main results'
print(json.dumps({'gate': 'partial_batch_result_histogram', 'result': 'PASS', 'published': 1, 'observations': 1}))

closed_metric = searx.results.ResultContainer()
closed_metric.close()
metric = searx.metrics.histogram('engine', name, 'result', 'count')
before_count = metric.count
closed_metric.extend(name, [])
closed_ok = metric.count == before_count
print(json.dumps({'gate': 'already_closed_no_metric', 'result': 'PASS' if closed_ok else 'FAIL'}))

functional = ValueError('fixture callback failure')
telemetry = RuntimeError('fixture telemetry failure')
telemetry_calls = []
original_observe = searx.results.histogram_observe
failure_container = searx.results.ResultContainer()


def fail_callback(result):
    raise functional


def fail_telemetry(*args):
    telemetry_calls.append(args)
    raise telemetry


failure_container.on_result = fail_callback
searx.results.histogram_observe = fail_telemetry
caught = None
try:
    failure_container.extend(name, [MainResult(url='https://example.invalid/failure', title='failure')])
except Exception as error:
    caught = error
finally:
    searx.results.histogram_observe = original_observe
exception_ok = caught is functional and len(telemetry_calls) == 1
print(json.dumps({'gate': 'functional_exception_survives_telemetry_failure', 'result': 'PASS' if exception_ok else 'FAIL', 'caught': type(caught).__name__, 'telemetry_calls': len(telemetry_calls)}))
assert closed_ok, 'already-closed call created spurious metric sample'
assert exception_ok, 'telemetry replaced original functional exception'
assert any('result-count telemetry failed' in message for message in records), 'telemetry failure must remain observable'

# An unrelated exception being handled by the caller must not be mistaken for
# this extend() call's functional failure.
caller_error = LookupError('unrelated caller error')
telemetry_only_caught = None
searx.results.histogram_observe = fail_telemetry
try:
    try:
        raise caller_error
    except LookupError:
        try:
            searx.results.ResultContainer().extend(name, [])
        except Exception as error:
            telemetry_only_caught = error
finally:
    searx.results.histogram_observe = original_observe
assert telemetry_only_caught is telemetry, 'unrelated caller exception replaced telemetry-only failure'
print(json.dumps({'gate': 'telemetry_only_exception_propagates_in_caller_handler', 'result': 'PASS'}))
