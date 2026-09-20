#!/usr/bin/env python3
"""Build the compact v2 search index from the unchanged canonical data files."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def read(name):
    # 必须显式指定 utf-8：data/*.js 是 UTF-8，而 read_text() 不传编码会用系统默认，
    # 在中文 Windows 上就是 GBK —— 数据里出现 GBK 认不出的字节序列时直接抛
    # UnicodeDecodeError。这个坑只在特定数据下才暴露。
    raw = (ROOT / 'data' / (name + '.js')).read_text(encoding='utf-8')
    return json.loads(raw.split('LD.' + name + '=', 1)[1].rstrip(';\n'))

meta, schools, groups, offerings = [read(n) for n in ('meta', 'schools', 'groups', 'offerings')]
links = [set() for _ in groups]
for row in offerings:
    assert 0 <= row[0] < len(groups)
    assert 0 <= row[2] < len(meta['dicts']['major'])
    links[row[0]].add((row[2], row[4], row[5]))
for row in groups:
    assert 0 <= row[0] < len(schools)
# detailStatus / detailSourceCount / detailUpdatedAt 很小，放进目录，
# 这样不用等详情正文（5.7 MB，懒加载）就能显示「官方来源 3 项 · 已关联… · 2026-09-20」
fields = ('code n prov reg city own typ lvl tag charter rk pg '
          'detailStatus detailSourceCount detailUpdatedAt').split()
catalog = {
    'version': '2.0.0', 'generated': meta['gen'], 'sourceVersion': meta['v'],
    'hashes': {n: hashlib.sha256((ROOT/'data'/(n+'.js')).read_bytes()).hexdigest()
               # details 也纳入：院校档案正文（每校 900+ 字）不进 catalog.json ——
               # 那会让首屏从 2.6 MB 涨到 4.8 MB，手机上不可接受。
               # 改成打开院校详情时按需加载 data/details.js，用这个哈希校验一致性。
               for n in ('meta', 'offerings', 'details')},
    'counts': meta['counts'],
    'schools': [{k: s.get(k) for k in fields} for s in schools],
    'groups': groups, 'links': [sorted(rows) for rows in links],
    'dicts': {k: meta['dicts'][k] for k in ('major', 'cat', 'catc')},
    'dist': {k: v for k, v in meta['dist'].items() if k.startswith(('2025|', '2026|'))},
    'tags': meta['tags'],
}
out = ROOT/'v2'/'catalog.json'
out.parent.mkdir(exist_ok=True)
def compact_numbers(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [compact_numbers(v) for v in value]
    if isinstance(value, dict):
        return {k: compact_numbers(v) for k, v in value.items()}
    return value
out.write_text(json.dumps(compact_numbers(catalog), ensure_ascii=False, separators=(',', ':')),
               encoding='utf-8')
print(f'{out.relative_to(ROOT)}: {out.stat().st_size:,} bytes; {len(groups):,} groups; {len(offerings):,} offerings')
