#!/usr/bin/env python3
"""BEA national input-output tables -> data/derived/io-{use,make}-{summary,sector}.json

The planner's production structure starts from the NATIONAL Use and Make tables (after
redefinitions, producers' prices) and is regionalised to Milwaukee later, from the
county's own industry mix (QCEW / BEA). Nothing here is Milwaukee-specific yet.

BEA prints '...' for cells it does not show (zero, per the sheet's own footnote); they
become 0. Row/column codes are BEA's IOCodes. Python, not node, only because the source
is .xlsx; needs openpyxl. Run: python3 -I build/io.py
"""
import json, os, sys, zipfile
import openpyxl

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ZIP = os.path.join(ROOT, 'data/raw/bea-io/AllTablesIO.zip')
OUT = os.path.join(ROOT, 'data/derived')
WORK = os.path.join(ROOT, 'data/work/bea-io')
os.makedirs(WORK, exist_ok=True)
with zipfile.ZipFile(ZIP) as z: z.extractall(WORK)

def num(v):
    if v is None or v == '...' or v == '': return 0
    return v if isinstance(v, (int, float)) else float(str(v).replace(',', ''))

def table(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    years = {}
    for name in wb.sheetnames:
        if not name.isdigit(): continue
        rows = list(wb[name].iter_rows(values_only=True))
        hdr = next(i for i, r in enumerate(rows) if r[0] == 'IOCode')
        codes, names = rows[hdr - 1], rows[hdr]
        cols = [(j, codes[j], names[j]) for j in range(2, len(names)) if names[j]]
        body = []
        for r in rows[hdr + 1:]:
            if r[1] is None: continue
            if r[0] is None and not str(r[1]).startswith('Total'): continue
            body.append({'code': r[0] or str(r[1]), 'name': r[1], 'v': [num(r[j]) for j, _, _ in cols]})
            if r[1] == 'Total Industry Output' or r[1] == 'Total Commodity Output': break
        years[name] = {'cols': [{'code': c or n, 'name': n} for _, c, n in cols], 'rows': body}
    return years

files = {
    'io-use-summary': 'IOUse_After_Redefinitions_PRO_1997-2023_Summary.xlsx',
    'io-use-sector': 'IOUse_After_Redefinitions_PRO_1997-2023_Sector.xlsx',
    'io-make-summary': 'IOMake_After_Redefinitions_PRO_1997-2023_Summary.xlsx',
    'io-make-sector': 'IOMake_After_Redefinitions_PRO_1997-2023_Sector.xlsx',
}
for out, f in files.items():
    t = table(os.path.join(WORK, f))
    meta = {'source': f'BEA {f} (sources.json: bea-io)', 'units': 'millions of current dollars', 'geography': 'United States', 'years': t}
    with open(os.path.join(OUT, out + '.json'), 'w') as fh: json.dump(meta, fh, separators=(',', ':'))
    y = max(t); print(out, len(t), 'years;', y, len(t[y]['rows']), 'rows x', len(t[y]['cols']), 'cols')
