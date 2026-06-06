#!/usr/bin/env python
"""
==============================================================================
 BigaOS "Worth a Look" — translation tooling (EN -> DE, extensible)
==============================================================================

The EMODnet data is English. We bake localized fields into the pack so the chart
can show German. Translation is a SEPARATE, PERSISTENT layer
(`scripts/heritage-translations.<lang>.json`) so re-pulling the data doesn't lose
it — `prepare-heritage.py` just re-applies the dictionary.

Two phases (the translation itself is done by translation agents in between):

  1. extract — collect the distinct strings that need translating from the baked
     GeoJSON and split them into small, field-tagged batch files under
     <workdir>/in/. Wreck NAMES are intentionally excluded (proper nouns kept
     as-is); UNESCO site names ARE included (looked-up German forms).

  2. merge — fold the per-batch German files in <workdir>/out/ (each a
     {english: german} map, written by the translation agents) into one
     structured dictionary: { country:{}, category:{}, period:{}, name:{}, desc:{} }.

Usage:
  python heritage-translate.py extract <geojson> <workdir>
  python heritage-translate.py merge   <workdir> <out_json>
"""

import json
import os
import re
import sys
import glob

# Dropped (treated as "no description") — pure filler, > a fifth of all wrecks.
PLACEHOLDER_DESCS = {
    'We regret that we are unable to supply descriptive details for this record at present',
    'We regret that we are unable to supply descriptive details for this record at present.',
}

# Per-field batch limits (items, and a char cap so a batch prompt stays sane).
MAX_ITEMS = {'desc': 120, 'name': 60, 'category': 90, 'period': 90, 'country': 90}
MAX_CHARS = 9000


def extract(geojson, workdir):
    data = json.load(open(geojson, encoding='utf-8'))
    feats = [x['properties'] for x in data['features']]

    fields = {'country': set(), 'category': set(), 'period': set(), 'name': set(), 'desc': set()}
    for p in feats:
        for k in ('country', 'category', 'period'):
            if p.get(k):
                fields[k].add(p[k])
        # Only UNESCO site names are translated; wreck names stay original.
        if p.get('kind') == 'site' and p.get('name'):
            fields['name'].add(p['name'])
        if p.get('desc') and p['desc'] not in PLACEHOLDER_DESCS:
            fields['desc'].add(p['desc'])

    indir = os.path.join(workdir, 'in')
    outdir = os.path.join(workdir, 'out')
    os.makedirs(indir, exist_ok=True)
    os.makedirs(outdir, exist_ok=True)
    for f in glob.glob(os.path.join(indir, '*.json')):
        os.remove(f)

    manifest = []
    for field, vals in fields.items():
        cur, cur_chars, batches = [], 0, []
        for s in sorted(vals):
            if cur and (len(cur) >= MAX_ITEMS.get(field, 120) or cur_chars + len(s) > MAX_CHARS):
                batches.append(cur)
                cur, cur_chars = [], 0
            cur.append(s)
            cur_chars += len(s)
        if cur:
            batches.append(cur)
        for i, b in enumerate(batches):
            name = f'{field}_{i:03d}'
            with open(os.path.join(indir, name + '.json'), 'w', encoding='utf-8') as fh:
                json.dump({'field': field, 'items': b}, fh, ensure_ascii=False, indent=0)
            manifest.append(name)

    with open(os.path.join(workdir, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh)

    print(f'batches: {len(manifest)} -> {indir}')
    for field in fields:
        print(f'  {field}: {len(fields[field])} distinct')


def _repair_string_array(txt):
    """
    Repair a JSON array of strings whose values contain unescaped ASCII
    double-quotes — the agents' recurring bug (e.g. a German `„STARFISH"` closes
    the JSON string early). Handles both layouts:
      - pretty-printed (one element per line): take each line's content between
        its first and last quote;
      - single line: strip the outer [" ... "] and split on the `","` delimiter.
    The element value's interior stray quotes are kept literally; json.dumps
    re-encodes them properly on write. (Assumes no value contains the exact
    sequence `","`, which holds for this dataset.)
    """
    s = txt.strip()
    if s.startswith('['):
        s = s[1:]
    if s.endswith(']'):
        s = s[:-1]
    s = s.strip()
    if s.endswith(','):
        s = s[:-1].rstrip()
    if s.startswith('"'):
        s = s[1:]
    if s.endswith('"'):
        s = s[:-1]
    if not s:
        raise ValueError('no elements found')
    # Element delimiter is `","` — possibly with newline/indent between (pretty
    # print). Interior stray ASCII quotes aren't followed by `,"`, so survive.
    return re.split(r'"\s*,\s*"', s)


def _load_loose_json(path):
    """Parse a batch output file, tolerating a ```json fence, stray prose, or
    unescaped inner quotes (line-based repair)."""
    txt = open(path, encoding='utf-8').read().strip()
    if txt.startswith('```'):
        txt = txt.split('\n', 1)[1] if '\n' in txt else txt
        if txt.rstrip().endswith('```'):
            txt = txt.rsplit('```', 1)[0]
    txt = txt.strip()
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        for op, cl in (('[', ']'), ('{', '}')):
            i, j = txt.find(op), txt.rfind(cl)
            if i != -1 and j > i:
                try:
                    return json.loads(txt[i:j + 1])
                except json.JSONDecodeError:
                    pass
        # Last resort: line-based repair of a pretty-printed string array.
        return _repair_string_array(txt)


def merge(workdir, out_json):
    result = {'country': {}, 'category': {}, 'period': {}, 'name': {}, 'desc': {}}
    manifest = json.load(open(os.path.join(workdir, 'manifest.json'), encoding='utf-8'))
    missing, mismatched, bad = [], [], []
    for name in manifest:
        field = name.rsplit('_', 1)[0]
        out_path = os.path.join(workdir, 'out', name + '.json')
        if not os.path.exists(out_path):
            missing.append(name)
            continue
        items = json.load(open(os.path.join(workdir, 'in', name + '.json'), encoding='utf-8'))['items']
        try:
            de = _load_loose_json(out_path)
        except (json.JSONDecodeError, ValueError):
            bad.append(name)
            continue
        # Agents write a same-order ARRAY of German strings; also accept an
        # {english: german} map as a fallback.
        if isinstance(de, dict):
            pairs = [(en, de.get(en)) for en in items]
        else:
            if len(de) != len(items):
                mismatched.append(f'{name} ({len(items)}->{len(de)})')
            pairs = list(zip(items, de))
        for en, g in pairs:
            if isinstance(g, str) and g.strip() and g.strip() != en:
                result[field][en] = g.strip()

    with open(out_json, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1, sort_keys=True)

    total = sum(len(v) for v in result.values())
    print(f'merged {total} translations -> {out_json}')
    for field in result:
        print(f'  {field}: {len(result[field])}')
    if mismatched:
        print(f'LENGTH MISMATCH {len(mismatched)}: {mismatched[:20]}')
    if bad:
        print(f'UNPARSEABLE {len(bad)}: {bad}')
    if missing:
        print(f'MISSING {len(missing)} batches: {missing[:20]}{" ..." if len(missing) > 20 else ""}')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == 'extract':
        extract(sys.argv[2], sys.argv[3])
    elif cmd == 'merge':
        merge(sys.argv[2], sys.argv[3])
    else:
        print(f'unknown command: {cmd}')
        sys.exit(1)


if __name__ == '__main__':
    main()
