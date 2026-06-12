import json
from pathlib import Path
from collections import Counter

file_path = Path('graphify-out/.graphify_detect.json')
if not file_path.exists():
    print('File does not exist')
    exit(1)

content = file_path.read_text(encoding='utf-8')
if not content:
    print('File is empty')
    exit(1)

try:
    detect = json.loads(content)
except json.JSONDecodeError as e:
    print(f'JSON error: {e}')
    # Try reading first few chars
    print(f'Start of file: {content[:100]!r}')
    exit(1)

all_files = [f for files in detect['files'].values() for f in files]
counts = Counter()
root = Path.cwd()
for f in all_files:
    p = Path(f)
    try:
        if p.is_absolute():
            rel = p.relative_to(root)
        else:
            rel = p
        if len(rel.parts) > 1:
            counts[rel.parts[0]] += 1
        else:
            counts['(root)'] += 1
    except ValueError:
        counts['(external)'] += 1

top_5 = counts.most_common(5)
print(json.dumps(top_5))
