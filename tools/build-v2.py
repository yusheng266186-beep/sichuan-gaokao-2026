#!/usr/bin/env python3
"""Build the compact v2 search index from the unchanged canonical data files."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def read(name):
    raw = (ROOT / 'data' / (name + '.js')).read_text()
    return json.loads(raw.split('LD.' + name + '=', 1)[1].rstrip(';\n'))

meta, schools, groups, offerings = [read(n) for n in ('meta', 'schools', 'groups', 'offerings')]
links = [set() for _ in groups]
for row in offerings:
    assert 0 <= row[0] < len(groups)
    assert 0 <= row[2] < len(meta['dicts']['major'])
    links[row[0]].add((row[2], row[4], row[5]))
for row in groups:
    assert 0 <= row[0] < len(schools)
fields = 'code n prov reg city own typ lvl tag charter rk pg'.split()
catalog = {
    'version': '2.0.0', 'generated': meta['gen'], 'sourceVersion': meta['v'],
    'hashes': {n: hashlib.sha256((ROOT/'data'/(n+'.js')).read_bytes()).hexdigest()
               for n in ('meta', 'offerings')},
    'counts': meta['counts'],
    'schools': [{k: s.get(k) for k in fields} for s in schools],
    'groups': groups, 'links': [sorted(rows) for rows in links],
    'dicts': {k: meta['dicts'][k] for k in ('major', 'cat', 'catc')},
    'dist': {k: v for k, v in meta['dist'].items() if k.startswith(('2025|', '2026|'))},
    'tags': meta['tags'],
}
out = ROOT/'v2'/'catalog.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')))
print(f'{out.relative_to(ROOT)}: {out.stat().st_size:,} bytes; {len(groups):,} groups; {len(offerings):,} offerings')
