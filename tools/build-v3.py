#!/usr/bin/env python3
"""Lossless V3 release: a search catalog, complete metadata, and school shards.

The canonical data/*.js files are never rewritten. Every field, missing-value
sentinel, dictionary entry, duplicate offering and archive survives the release.
Use --check to reconstruct all five sources and compare every value.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'v3' / 'data'
NAMES = ('meta', 'schools', 'groups', 'offerings', 'details')
GROUP_FIELDS = ('schoolIndex track batch admissionType code compoundCode majorCount '
                'plan rank2025 score2025 rank2024 score2024 rank2023 score2023 '
                'lineSource requirements feeMin feeMax newMajorCount conflict '
                'admitted2025 admitted2024').split()
OFFERING_FIELDS = ('groupIndex code majorIndex noteIndex categoryIndex classIndex '
                   'plan reportedFeeIndex reportedFeeAmount score2025 rank2025 '
                   'score2024 rank2024 score2023 rank2023 newFlag feeScope '
                   'officialFeeMin officialFeeMax feeExcerptIndex feeURLIndex level '
                   'ratingIndex majorRank assessmentIndex specialtyIndex '
                   'masterIndex doctorIndex publisherIndex sourceKindIndex').split()
DICT_COLUMNS = {2:'major',3:'note',4:'cat',5:'catc',7:'tfee',19:'fee',20:'url',
                22:'sr',24:'de',25:'ml',26:'mp',27:'dp',28:'fpub',29:'fkind'}
SUMMARY_FIELDS = ('code n prov reg city own typ lvl tag charter rk gr pg aff focus '
                  'detailStatus detailSourceCount detailUpdatedAt').split()


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read_sources():
    sources = {}
    for name in NAMES:
        raw = (ROOT / 'data' / (name + '.js')).read_text(encoding='utf-8')
        sources[name] = json.loads(raw.split('LD.' + name + '=', 1)[1].rstrip(';\n'))
    return sources


def validate(src):
    schools, groups, offerings, meta = [src[n] for n in ('schools','groups','offerings','meta')]
    assert len(schools) == meta['counts']['schools']
    assert len(groups) == meta['counts']['groups']
    assert len(offerings) == meta['counts']['offerings']
    assert len({s['code'] for s in schools}) == len(schools), 'Duplicate school code'
    keys = set()
    for i, g in enumerate(groups):
        assert len(g) == len(GROUP_FIELDS), ('Group schema changed', i)
        assert 0 <= g[0] < len(schools)
        assert g[1] in (0, 1)
        key = '|'.join(map(str, (schools[g[0]]['code'], g[1], g[2], g[3], g[4])))
        assert key not in keys, ('Duplicate group identity', key)
        keys.add(key)
    for i, o in enumerate(offerings):
        assert len(o) == len(OFFERING_FIELDS), ('Offering schema changed', i)
        assert 0 <= o[0] < len(groups)
        for col, dictionary in DICT_COLUMNS.items():
            assert o[col] < 0 or 0 <= o[col] < len(meta['dicts'][dictionary]), (i, dictionary, o[col])
    assert set(src['details']).issubset({s['code'] for s in schools})


def build(src):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'schools').mkdir(exist_ok=True)
    schools, groups, offerings, meta = [src[n] for n in ('schools','groups','offerings','meta')]
    chunks = {}
    for i, school in enumerate(schools):
        bucket = f'{i // 64:02d}'
        chunk = chunks.setdefault(bucket, {'schemaVersion':3, 'schools':[], 'offerings':[]})
        archive = src['details'].get(school['code'])
        # None means absent. Empty string means a present empty source archive.
        chunk['schools'].append([i, school, archive])
    links = [set() for _ in groups]
    for i, row in enumerate(offerings):
        bucket = f'{groups[row[0]][0] // 64:02d}'
        chunks[bucket]['offerings'].append([i, *row])
        links[row[0]].add((row[2], row[4], row[5]))
    files = {}
    def write(path, value):
        raw = encode(value)
        (OUT / path).write_bytes(raw)
        files[path] = {'sha256':digest(raw), 'bytes':len(raw)}
    write('meta.json', meta)
    for bucket, chunk in chunks.items():
        write(f'schools/{bucket}.json', chunk)
    # Summary fields are an acceleration layer. Full school objects are in shards.
    catalog = {
        'schemaVersion':3, 'sourceVersion':meta['v'], 'generated':meta['gen'],
        'counts':dict(meta['counts'], majors=len(meta['dicts']['major']), archives=len(src['details'])),
        'schools':[{k:s[k] for k in SUMMARY_FIELDS if k in s} for s in schools],
        'groups':groups, 'links':[sorted(rows) for rows in links],
        'dicts':{k:meta['dicts'][k] for k in ('major','cat','catc')},
        'dist':meta['dist'], 'tags':meta['tags'], 'shardSize':64,
        'schemas':{'group':GROUP_FIELDS, 'offering':OFFERING_FIELDS},
        'files':files.copy(),
    }
    write('catalog.json', catalog)
    manifest = {
        'schemaVersion':3, 'sourceVersion':meta['v'], 'generated':meta['gen'],
        'counts':catalog['counts'], 'shards':len(chunks), 'files':files,
        'sources':{n:{'path':f'data/{n}.js',
                      'sha256':digest((ROOT/'data'/(n+'.js')).read_bytes()),
                      'semanticSha256':digest(encode(src[n]))} for n in NAMES},
        'coverage':{
            'groupsWith2025Line':sum(g[8]>0 for g in groups),
            'groupsWithRequirements':sum(bool(g[15]) for g in groups),
            'groupsWithReportedFees':sum(g[16]>=0 for g in groups),
            'offeringsWith2025Line':sum(o[10]>0 for o in offerings),
            'schoolsWithCharter':sum(bool(s.get('charter')) for s in schools),
            'offeringRatingCoverage':sum(o[22]>=0 for o in offerings),
            'dictionaryEntries':{k:len(v) for k,v in meta['dicts'].items()},
            'schoolFields':sorted({k for s in schools for k in s}),
        },
        'migration':{'lostRecords':0, 'lostFields':0, 'sourceFilesRewritten':False,
                     'unknownValues':'Original negative sentinels, empty strings, zero and null are preserved.',
                     'verification':'Reconstruct all five inputs and compare all values, then validate every file hash.'},
    }
    (OUT/'manifest.json').write_bytes(encode(manifest))
    return manifest


def check(src):
    manifest = json.loads((OUT/'manifest.json').read_text('utf-8'))
    for path, info in manifest['files'].items():
        raw = (OUT/path).read_bytes()
        assert len(raw) == info['bytes'] and digest(raw) == info['sha256'], ('Release hash mismatch', path)
    catalog = json.loads((OUT/'catalog.json').read_text('utf-8'))
    schools, offerings, details = [None]*len(src['schools']), [None]*len(src['offerings']), {}
    for path in manifest['files']:
        if not path.startswith('schools/'):
            continue
        chunk = json.loads((OUT/path).read_text('utf-8'))
        for ordinal, school, archive in chunk['schools']:
            assert schools[ordinal] is None, 'Duplicate school ordinal'
            schools[ordinal] = school
            if archive is not None:
                details[school['code']] = archive
        for row in chunk['offerings']:
            assert offerings[row[0]] is None, 'Duplicate offering ordinal'
            offerings[row[0]] = row[1:]
    restored = {'meta':json.loads((OUT/'meta.json').read_text('utf-8')),
                'schools':schools, 'groups':catalog['groups'], 'offerings':offerings, 'details':details}
    for name in NAMES:
        assert restored[name] == src[name], ('Lossless comparison failed', name)
        assert digest((ROOT/'data'/(name+'.js')).read_bytes()) == manifest['sources'][name]['sha256']
    # Every catalog link must be derived from the full offerings of that group.
    links = [set() for _ in src['groups']]
    for o in src['offerings']:
        links[o[0]].add((o[2],o[4],o[5]))
    assert catalog['links'] == [list(map(list, sorted(rows))) for rows in links]
    print('V3 lossless verification passed: all 5 source datasets, every field, every file hash, every relationship.')
    print(json.dumps(manifest['counts'], ensure_ascii=False), f"{manifest['shards']} on-demand shards")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the existing release without rewriting it')
    args = parser.parse_args()
    source = read_sources()
    validate(source)
    if not args.check:
        build(source)
    check(source)
