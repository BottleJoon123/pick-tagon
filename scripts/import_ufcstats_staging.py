"""
import_ufcstats_staging.py
--------------------------
data/ufcstats_fighters_raw.csv → fighter_stats_staging 테이블 import

사용법:
  # 환경변수 설정 (service role key 필요)
  set SUPABASE_URL=https://rnnrimzrypayvnmznpin.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

  python scripts/import_ufcstats_staging.py
  python scripts/import_ufcstats_staging.py --batch ufcstats_20260520  # 배치명 지정
  python scripts/import_ufcstats_staging.py --dry-run                   # DB 삽입 없이 CSV만 검증

주의:
  - fighters 테이블 UPDATE 없음 — staging import만 수행
  - 동일 batch + ufc_stats_id 조합은 ON CONFLICT DO NOTHING
"""

import argparse
import csv
import os
import sys
from datetime import datetime, timezone

import requests

BASE     = os.path.join(os.path.dirname(__file__), "..")
CSV_PATH = os.path.join(BASE, "data", "ufcstats_fighters_raw.csv")
BATCH_SIZE = 250

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rnnrimzrypayvnmznpin.supabase.co")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def load_csv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def to_numeric(val):
    v = str(val).strip()
    if v in ("", "None", "NULL"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def build_rows(csv_rows, import_batch):
    rows = []
    for r in csv_rows:
        rows.append({
            "import_batch":        import_batch,
            "source_ufc_stats_id": r.get("ufc_stats_id") or None,
            "profile_url":         r.get("profile_url") or None,
            "source_name":         r["name_en"].strip(),
            "slpm":    to_numeric(r.get("slpm")),
            "str_acc": to_numeric(r.get("str_acc")),
            "sapm":    to_numeric(r.get("sapm")),
            "str_def": to_numeric(r.get("str_def")),
            "td_avg":  to_numeric(r.get("td_avg")),
            "td_acc":  to_numeric(r.get("td_acc")),
            "td_def":  to_numeric(r.get("td_def")),
            "sub_avg": to_numeric(r.get("sub_avg")),
            "scraped_at":          r.get("scraped_at") or None,
        })
    return rows


def insert_batch(rows, dry_run):
    if dry_run:
        return len(rows), 0

    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set.", file=sys.stderr)
        sys.exit(1)

    url = f"{SUPABASE_URL}/rest/v1/fighter_stats_staging"
    headers = {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=ignore-duplicates,return=minimal",
    }
    resp = requests.post(url, json=rows, headers=headers, timeout=30)
    if resp.status_code not in (200, 201):
        print(f"  HTTP {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
        return 0, len(rows)
    return len(rows), 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=str,
                        default=f"ufcstats_{datetime.now(timezone.utc).strftime('%Y%m%d')}")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Import batch : {args.batch}")
    print(f"CSV path     : {os.path.abspath(CSV_PATH)}")
    print(f"Dry-run      : {args.dry_run}")
    print()

    csv_rows = load_csv(CSV_PATH)
    print(f"CSV rows loaded: {len(csv_rows)}")

    rows = build_rows(csv_rows, args.batch)

    total_ok, total_err = 0, 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i + BATCH_SIZE]
        ok, err = insert_batch(chunk, args.dry_run)
        total_ok  += ok
        total_err += err
        print(f"  [{i + len(chunk)}/{len(rows)}] inserted={ok} failed={err}")

    print(f"\nDone. total_inserted={total_ok}  total_failed={total_err}")
    if args.dry_run:
        print("(dry-run: no DB writes)")


if __name__ == "__main__":
    main()
