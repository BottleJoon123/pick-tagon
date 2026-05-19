"""
validate_ufcstats_csv.py — data/ufcstats_fighters_raw.csv 품질 검증
"""

import csv
import os
from collections import Counter

BASE   = os.path.join(os.path.dirname(__file__), "..")
CSV    = os.path.join(BASE, "data", "ufcstats_fighters_raw.csv")
ERR    = os.path.join(BASE, "data", "ufcstats_scrape_errors.csv")

STAT_COLS  = ["slpm","str_acc","sapm","str_def","td_avg","td_acc","td_def","sub_avg"]
PCT_COLS   = ["str_acc","str_def","td_acc","td_def"]
RAW_COLS   = ["slpm","sapm","td_avg","sub_avg"]

NOTABLE = [
    "Islam Makhachev","Khamzat Chimaev","Sean Strickland",
    "Tatsuro Taira","Jon Jones","Conor McGregor","Alex Pereira",
    "Luke Rockhold","Israel Adesanya","Charles Oliveira",
]

SEP = "=" * 60

def load_csv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))

# ─────────────────────────────────────────────────────────────
print(SEP)
print("1. FILE & ROW COUNT")
print(SEP)
rows = load_csv(CSV)
print(f"  Path      : {os.path.abspath(CSV)}")
print(f"  Row count : {len(rows)}")

# ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("2. COLUMN CHECK")
print(SEP)
expected = ["ufc_stats_id","name_en","profile_url"] + STAT_COLS + ["scraped_at"]
actual   = list(rows[0].keys()) if rows else []
for col in expected:
    ok = "OK" if col in actual else "!! MISSING"
    print(f"  {ok}  {col}")
extra = [c for c in actual if c not in expected]
if extra:
    print(f"  (extra cols: {extra})")

# ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("3. DUPLICATES")
print(SEP)

id_counts   = Counter(r["ufc_stats_id"] for r in rows)
url_counts  = Counter(r["profile_url"]  for r in rows)
name_counts = Counter(r["name_en"]      for r in rows)

dup_ids   = {k: v for k, v in id_counts.items()  if v > 1}
dup_urls  = {k: v for k, v in url_counts.items() if v > 1}
dup_names = {k: v for k, v in name_counts.items() if v > 1}

print(f"  ufc_stats_id duplicates : {len(dup_ids)}")
print(f"  profile_url  duplicates : {len(dup_urls)}")
print(f"  name_en      duplicates : {len(dup_names)}")
if dup_names:
    top = sorted(dup_names.items(), key=lambda x: -x[1])[:10]
    for name, cnt in top:
        print(f"    [{cnt}x] {name}")

# ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("4. NULL / EMPTY CHECK")
print(SEP)

name_empty = [r for r in rows if not r.get("name_en","").strip()]
print(f"  name_en null/empty : {len(name_empty)}")

for col in STAT_COLS:
    null_n = sum(1 for r in rows if r.get(col,"").strip() == "")
    print(f"  {col:<12} null/empty : {null_n}")

# ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("5. VALUE RANGE SANITY CHECK")
print(SEP)

pct_out, neg_out = [], []
for r in rows:
    for col in PCT_COLS:
        v = r.get(col,"").strip()
        if v:
            try:
                fv = float(v)
                if fv < 0 or fv > 100:
                    pct_out.append((r["name_en"], col, fv))
            except ValueError:
                pass
    for col in RAW_COLS:
        v = r.get(col,"").strip()
        if v:
            try:
                fv = float(v)
                if fv < 0:
                    neg_out.append((r["name_en"], col, fv))
            except ValueError:
                pass

print(f"  % fields out of [0,100] : {len(pct_out)}")
if pct_out:
    for name, col, val in pct_out[:10]:
        print(f"    {name} | {col}={val}")

print(f"  Negative raw values     : {len(neg_out)}")
if neg_out:
    for name, col, val in neg_out[:5]:
        print(f"    {name} | {col}={val}")

# outlier top 20 by slpm
print(f"\n  Outlier top 20 by slpm:")
slpm_rows = []
for r in rows:
    try:
        slpm_rows.append((r["name_en"], float(r["slpm"]), float(r["str_acc"]),
                          float(r["sapm"]), float(r["td_avg"])))
    except (ValueError, KeyError):
        pass
slpm_rows.sort(key=lambda x: -x[1])
for name, slpm, sacc, sapm, tda in slpm_rows[:20]:
    print(f"    {name:<30} slpm={slpm:.2f}  str_acc={sacc:.0f}%  sapm={sapm:.2f}  td_avg={tda:.2f}")

# ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("6. ERROR CSV")
print(SEP)
err_rows = []
if os.path.exists(ERR):
    err_rows = load_csv(ERR)
    print(f"  Failures : {len(err_rows)}")
    for r in err_rows:
        print(f"  - {r['name_en']}")
        print(f"      {r['profile_url']}")
        print(f"      err: {r['error'][:80]}")
else:
    print("  Error CSV not found.")

rockhold_in_err  = any("Rockhold" in r["name_en"] for r in err_rows)
rockhold_in_data = any("Rockhold" in r["name_en"] for r in rows)
print(f"\n  Luke Rockhold in errors  : {rockhold_in_err}")
print(f"  Luke Rockhold in data    : {rockhold_in_data}")

# ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("7. NOTABLE FIGHTER CHECK")
print(SEP)
name_index = {r["name_en"].strip().lower(): r for r in rows}
for target in NOTABLE:
    key = target.lower()
    if key in name_index:
        r = name_index[key]
        print(f"  [OK]  {target}")
        print(f"       slpm={r['slpm']}  str_acc={r['str_acc']}  sapm={r['sapm']}  "
              f"str_def={r['str_def']}  td_avg={r['td_avg']}  td_acc={r['td_acc']}  "
              f"td_def={r['td_def']}  sub_avg={r['sub_avg']}")
    else:
        # partial match
        matches = [r for r in rows if target.split()[0].lower() in r["name_en"].lower()
                   and target.split()[-1].lower() in r["name_en"].lower()]
        if matches:
            m = matches[0]
            print(f"  [~]  {target} -> found as '{m['name_en']}'")
            print(f"       slpm={m['slpm']}  str_acc={m['str_acc']}  sapm={m['sapm']}  "
                  f"str_def={m['str_def']}  td_avg={m['td_avg']}  td_acc={m['td_acc']}  "
                  f"td_def={m['td_def']}  sub_avg={m['sub_avg']}")
        else:
            in_err = any(target.split()[-1] in r["name_en"] for r in err_rows)
            status = "(in error list)" if in_err else "(missing)"
            print(f"  [!!] {target} -- NOT FOUND {status}")

# ─────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("ZERO-STAT DISTRIBUTION")
print(SEP)
all_zero = [r for r in rows if all(float(r.get(c,0) or 0) == 0 for c in STAT_COLS)]
print(f"  Fighters with ALL stats = 0.0 : {len(all_zero)}")
nonzero = len(rows) - len(all_zero)
print(f"  Fighters with at least 1 non-zero stat : {nonzero}")
