"""
match_ufcstats_staging.py
--------------------------
fighter_stats_staging ↔ fighters 매칭 + 리포트 출력

사용법:
  set SUPABASE_URL=https://rnnrimzrypayvnmznpin.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

  python scripts/match_ufcstats_staging.py                        # 매칭 실행 + 리포트
  python scripts/match_ufcstats_staging.py --batch ufcstats_20260519
  python scripts/match_ufcstats_staging.py --report-only          # 매칭 없이 현재 상태 리포트만

매칭 우선순위:
  1순위 ufc_stats_id 직접 매칭  → match_status='exact', confidence=100
  2순위 name_en 정규화 완전 일치 → match_status='exact', confidence=100
  3순위 동명이인 (복수 candidates) → match_status='ambiguous', confidence=0
  4순위 매칭 실패                → match_status='unmatched', confidence=0

  fuzzy 매칭은 report 후보만 출력 — 자동 승인 없음
"""

import argparse
import os
import re
import sys
import unicodedata

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rnnrimzrypayvnmznpin.supabase.co")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

SEP = "=" * 60


def api_get(path, params=None):
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set.", file=sys.stderr)
        sys.exit(1)
    headers = {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    }
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers,
                        params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def api_patch(path, match_params, body):
    headers = {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }
    resp = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}",
                          headers=headers, params=match_params, json=body, timeout=30)
    if resp.status_code not in (200, 204):
        print(f"  PATCH error {resp.status_code}: {resp.text[:200]}", file=sys.stderr)


def normalize_name(name):
    """소문자 + NFC + 하이픈/아포스트로피/공백 정규화"""
    n = unicodedata.normalize("NFC", name.lower().strip())
    n = re.sub(r"[-'’‘]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def load_fighters():
    fighters = []
    offset = 0
    while True:
        chunk = api_get("fighters",
                        params={"select": "id,name_en,ufc_stats_id",
                                "limit": 1000, "offset": offset})
        if not chunk:
            break
        fighters.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return fighters


def load_staging(batch):
    rows = []
    offset = 0
    params = {"select": "*", "limit": 1000, "import_batch": f"eq.{batch}"}
    while True:
        params["offset"] = offset
        chunk = api_get("fighter_stats_staging", params=params)
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def run_matching(staging_rows, fighters, dry_run=False):
    # 인덱스 구성
    by_ufc_stats_id = {}  # ufc_stats_id → fighter
    by_norm_name    = {}  # normalized_name → [fighter, ...]

    for f in fighters:
        uid = (f.get("ufc_stats_id") or "").strip()
        if uid:
            by_ufc_stats_id[uid] = f

        nn = normalize_name(f.get("name_en") or "")
        if nn:
            by_norm_name.setdefault(nn, []).append(f)

    results = {"exact": 0, "ambiguous": 0, "unmatched": 0, "fuzzy_candidates": []}
    updates = []

    for s in staging_rows:
        sid        = s["id"]
        uid        = (s.get("source_ufc_stats_id") or "").strip()
        sname      = (s.get("source_name") or "").strip()
        sname_norm = normalize_name(sname)

        matched  = None
        status   = "unmatched"
        conf     = 0
        reason   = ""

        # 1순위: ufc_stats_id
        if uid and uid in by_ufc_stats_id:
            matched = by_ufc_stats_id[uid]
            status  = "exact"
            conf    = 100
            reason  = "ufc_stats_id"
        # 2순위: normalized name exact
        elif sname_norm in by_norm_name:
            candidates = by_norm_name[sname_norm]
            if len(candidates) == 1:
                matched = candidates[0]
                status  = "exact"
                conf    = 100
                reason  = "name_en_exact"
            else:
                status  = "ambiguous"
                conf    = 0
                reason  = f"ambiguous: {len(candidates)} fighters with same normalized name"
        else:
            status = "unmatched"
            conf   = 0
            reason = "no_match"
            results["fuzzy_candidates"].append(sname)

        if status == "exact":
            results["exact"] += 1
        elif status == "ambiguous":
            results["ambiguous"] += 1
        else:
            results["unmatched"] += 1

        if not dry_run:
            updates.append((sid, matched["id"] if matched else None, status, conf, reason))

    if not dry_run:
        for sid, fid, status, conf, reason in updates:
            api_patch("fighter_stats_staging",
                      match_params={"id": f"eq.{sid}"},
                      body={
                          "matched_fighter_id": fid,
                          "match_status":       status,
                          "match_confidence":   conf,
                          "match_reason":       reason,
                      })

    return results


def print_report(staging_rows, results, batch):
    total = len(staging_rows)
    exact = results["exact"]
    ambig = results["ambiguous"]
    unmatch = results["unmatched"]
    fuzzy   = results["fuzzy_candidates"]

    print(SEP)
    print("MATCHING REPORT")
    print(SEP)
    print(f"  Import batch    : {batch}")
    print(f"  Total staged    : {total}")
    print(f"  Exact match     : {exact}  ({exact/total*100:.1f}%)")
    print(f"  Ambiguous       : {ambig}")
    print(f"  Unmatched       : {unmatch}")
    match_rate = (exact / total * 100) if total else 0
    print(f"  Match rate      : {match_rate:.1f}%")
    print(f"  QA threshold    : >= 90.0% {'OK' if match_rate >= 90 else '!! BELOW THRESHOLD'}")

    if fuzzy:
        print(f"\n  Top 30 unmatched (total {len(fuzzy)}):")
        for name in fuzzy[:30]:
            print(f"    - {name}")

    print(SEP)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=str, default="ufcstats_20260519")
    parser.add_argument("--report-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true",
                        help="매칭 계산만, DB update 없음")
    args = parser.parse_args()

    print(f"Loading fighters table...")
    fighters = load_fighters()
    print(f"  {len(fighters)} fighters loaded")

    print(f"Loading staging batch '{args.batch}'...")
    staging_rows = load_staging(args.batch)
    print(f"  {len(staging_rows)} staging rows loaded")

    if not staging_rows:
        print("No staging rows found for this batch.")
        return

    if args.report_only:
        status_counts = {}
        for r in staging_rows:
            s = r.get("match_status", "pending")
            status_counts[s] = status_counts.get(s, 0) + 1
        total = len(staging_rows)
        exact = status_counts.get("exact", 0)
        results = {
            "exact":     exact,
            "ambiguous": status_counts.get("ambiguous", 0),
            "unmatched": status_counts.get("unmatched", 0) + status_counts.get("pending", 0),
            "fuzzy_candidates": [r["source_name"] for r in staging_rows
                                  if r.get("match_status") in ("unmatched", "pending")]
        }
        print_report(staging_rows, results, args.batch)
        return

    print(f"\nRunning matching (dry_run={args.dry_run or args.report_only})...")
    results = run_matching(staging_rows, fighters, dry_run=args.dry_run)
    print_report(staging_rows, results, args.batch)


if __name__ == "__main__":
    main()
