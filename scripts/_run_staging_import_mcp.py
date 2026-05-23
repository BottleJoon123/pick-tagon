"""
_run_staging_import_mcp.py
--------------------------
CSV를 읽어 execute_sql 형태의 JSONB 배치 SQL 파일을 생성한다.
각 파일은 MCP execute_sql로 실행하면 된다.

출력: data/_jsonbatches/batch_NNN.sql
"""

import csv, os, json

BASE    = os.path.join(os.path.dirname(__file__), "..")
CSV     = os.path.join(BASE, "data", "ufcstats_fighters_raw.csv")
OUT_DIR = os.path.join(BASE, "data", "_jsonbatches")
BATCH   = 100   # JSONB row count per SQL call

def to_n(v):
    try:
        return float(v)
    except Exception:
        return None

os.makedirs(OUT_DIR, exist_ok=True)
# clean old files
for f in os.listdir(OUT_DIR):
    os.remove(os.path.join(OUT_DIR, f))

with open(CSV, encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

print(f"Loaded {len(rows)} CSV rows")

batches = []
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i + BATCH]
    obj_list = []
    for r in chunk:
        obj = {
            "import_batch":        "ufcstats_20260519",
            "source_ufc_stats_id": r["ufc_stats_id"] or None,
            "profile_url":         r["profile_url"] or None,
            "source_name":         r["name_en"].strip(),
            "slpm":    to_n(r["slpm"]),
            "str_acc": to_n(r["str_acc"]),
            "sapm":    to_n(r["sapm"]),
            "str_def": to_n(r["str_def"]),
            "td_avg":  to_n(r["td_avg"]),
            "td_acc":  to_n(r["td_acc"]),
            "td_def":  to_n(r["td_def"]),
            "sub_avg": to_n(r["sub_avg"]),
            "scraped_at": r["scraped_at"] or None,
        }
        obj_list.append(obj)

    # Serialize to compact JSON, escape single quotes for SQL
    json_str = json.dumps(obj_list, ensure_ascii=False)
    sql_json = json_str.replace("'", "''")

    sql = f"SELECT public._staging_bulk_import('{sql_json}'::JSONB);"
    batches.append(sql)

    path = os.path.join(OUT_DIR, f"batch_{len(batches)-1:03d}.sql")
    with open(path, "w", encoding="utf-8") as f:
        f.write(sql)

print(f"Generated {len(batches)} batches of ~{BATCH} rows")
print(f"Batch 0 size: {len(batches[0])} bytes")
print(f"Output dir: {OUT_DIR}")
