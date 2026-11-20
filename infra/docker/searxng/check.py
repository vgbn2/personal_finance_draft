import json
import threading
from types import SimpleNamespace

import searx.engines
import searx.metrics
import searx.results
from searx.result_types import MainResult

assert '_publish_results' in searx.results.ResultContainer.extend.__code__.co_names, (
    'Python imported unpatched code; check inherited bytecode caches'
)

name = 'offline_lifecycle_fixture'
searx.engines.engines[name] = SimpleNamespace(
    name=name,
    paging=True,
    display_error_messages=True,
    timeout=1,
    categories=['general'],
)
searx.metrics.initialize([name])

container = searx.results.ResultContainer()
entered = threading.Event()
release = threading.Event()
closed = threading.Event()
errors = []


def callback(result):
    entered.set()
    assert release.wait(3), 'callback release timed out'
    return True


def publish():
    try:
        container.extend(name, [MainResult(url='https://example.invalid', title='fixture')])
    except BaseException as error:
        errors.append(error)


def close():
    try:
        container.close()
        closed.set()
    except BaseException as error:
        errors.append(error)


container.on_result = callback
worker = threading.Thread(target=publish)
closer = threading.Thread(target=close)
worker.start()
assert entered.wait(2), 'callback did not start'
closer.start()
try:
    assert closed.wait(1), 'close blocked by plugin callback'
finally:
    release.set()
    worker.join(3)
    closer.join(3)
assert not worker.is_alive() and not closer.is_alive()
assert not errors, errors
assert container._closed
assert not container.get_ordered_results(), 'late result published'
container.close()

faults = set()
paging_error = RuntimeError('paging fixture')
callback_error = ValueError('callback fixture')


class PagingFault(searx.results.ResultContainer):
    def __getattribute__(self, attribute):
        if attribute == 'paging' and id(self) in faults:
            raise paging_error
        return super().__getattribute__(attribute)


faulty = PagingFault()


def fail(result):
    faults.add(id(faulty))
    raise callback_error


faulty.on_result = fail
try:
    faulty.extend(name, [MainResult(url='https://example.invalid/fault', title='fault')])
except ValueError as error:
    assert error is callback_error
else:
    raise AssertionError('original callback error not raised')
finally:
    faults.discard(id(faulty))

faulty = PagingFault()
faults.add(id(faulty))
try:
    faulty.extend(name, [])
except RuntimeError as error:
    assert error is paging_error
else:
    raise AssertionError('paging-only error suppressed')
finally:
    faults.discard(id(faulty))

print(json.dumps({'callback_deadline': 'PASS', 'late_publish': 'PASS', 'idempotent_close': 'PASS', 'paging_error_priority': 'PASS', 'paging_only_error': 'PASS'}))
