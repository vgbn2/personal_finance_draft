import sys, json
from graphify.detect import detect_incremental, save_manifest
from pathlib import Path

result = detect_incremental(Path('.'))
new_total = result.get('new_total', 0)
Path('graphify-out/.graphify_incremental.json').write_text(json.dumps(result))
if new_total == 0:
    print('No files changed since last run. Nothing to update.')
    sys.exit(0)
print(f'{new_total} new/changed file(s) to re-extract.')
