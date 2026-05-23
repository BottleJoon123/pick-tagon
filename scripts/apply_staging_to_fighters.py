"""
apply_staging_to_fighters.py
-----------------------------
fighter_stats_staging (approved=true) → fighters raw stat 컬럼 일괄 업데이트

기본 모드: dry-run  (실제 변경 없음)
실제 적용: --execute 플래그 필수 + 모든 blocking 조건 통과 필요

사용법:
  set SUPABASE_URL=https://rnnrimzrypayvnmznpin.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

  python scripts/apply_staging_to_fighters.py                     # dry-run (안전)
  python scripts/apply_staging_to_fighters.py --batch ufcstats_20260519
  python scripts/apply_staging_to_fighters.py --execute           # 실제 적용 (승인 필요)

apply 조건 (모두 충족 필수):
  1. staging.approved = true
  2. staging.matched_fighter_id IS NOT NULL
  3. staging.match_status = 'exact'
  4. staging.import_batch = <batch>
  중복 시 staging.id 최대(최신) row 1개만 적용

업데이트 컬럼 (fighters 테이블):
  slpm, str_acc, sapm, str_def, td_avg, td_acc, td_def, sub_avg, stats_updated_at

로그:
  적용 후 admin_audit_logs에 per-fighter 기록 (action='ufc_stats_bulk_apply')

⚠ 주의:
  - fighters.stats[] 배열 재계산은 이 스크립트에서 수행하지 않음
    (별도 admin_recompute_fighter_stats RPC 단계)
  - fighters UPDATE는 이 스크립트의 --execute 모드에서만 발생
  - approved=true 세팅은 별도 admin 작업 필요 (이 스크립트에서 승인하지 않음)
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rnnrimzrypayvnmznpin.supabase.co")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

BATCH_DEFAULT = "ufcstats_20260519"
RAW_STAT_COLS = ["slpm", "str_acc", "sapm", "str_def", "td_avg", "td_acc", "td_def", "sub_avg"]
SEP = "=" * 60

# 배치당 audit log 삽입 크기
AUDIT_BATCH = 50


# ---------------------------------------------------------------------------
# REST helpers
# ---------------------------------------------------------------------------

def _headers(extra=None):
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY 환경변수 필요", file=sys.stderr)
        sys.exit(1)
    h = {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type":  "application/json",
    }
    if extra:
        h.update(extra)
    return h


def api_get(path, params=None):
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/{path}",
                        headers=_headers(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def api_patch(path, params, body):
    resp = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}",
                          headers=_headers({"Prefer": "return=minimal"}),
                          params=params, json=body, timeout=30)
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"PATCH {path} failed [{resp.status_code}]: {resp.text[:300]}")


def api_post(path, body):
    resp = requests.post(f"{SUPABASE_URL}/rest/v1/{path}",
                         headers=_headers({"Prefer": "return=minimal"}),
                         json=body, timeout=30)
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"POST {path} failed [{resp.status_code}]: {resp.text[:300]}")


def paginate(table, params):
    rows, offset = [], 0
    while True:
        params["offset"] = offset
        chunk = api_get(table, params=dict(params, limit=1000))
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


# ---------------------------------------------------------------------------
# Data loaders
# ---------------------------------------------------------------------------

def load_staging(batch):
    return paginate("fighter_stats_staging", {
        "select":       "id,matched_fighter_id,match_status,approved,source_name,"
                        "source_ufc_stats_id,"
                        "slpm,str_acc,sapm,str_def,td_avg,td_acc,td_def,sub_avg",
        "import_batch": f"eq.{batch}",
    })


def load_fighters():
    return paginate("fighters", {
        "select": "id,name,name_en,division,"
                  "slpm,str_acc,sapm,str_def,td_avg,td_acc,td_def,sub_avg",
    })


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def classify(staging_rows):
    approved, invalid_approved = [], []
    for r in staging_rows:
        if r.get("approved"):
            ok = r.get("matched_fighter_id") and r.get("match_status") == "exact"
            (approved if ok else invalid_approved).append(r)
    return approved, invalid_approved


def find_duplicates(approved_rows):
    by_fighter = {}
    for r in approved_rows:
        fid = r["matched_fighter_id"]
        by_fighter.setdefault(fid, []).append(r)
    return {fid: rows for fid, rows in by_fighter.items() if len(rows) > 1}


def deduplicate(approved_rows):
    """중복 matched_fighter_id 중 id 최대(최신) row 우선"""
    best = {}
    for r in approved_rows:
        fid = r["matched_fighter_id"]
        if fid not in best or r["id"] > best[fid]["id"]:
            best[fid] = r
    return list(best.values())


def check_blocking(approved, invalid_approved):
    issues = []
    if not approved and not invalid_approved:
        issues.append("approved=true 행 없음 — 아직 아무것도 승인되지 않았음")
    if invalid_approved:
        issues.append(f"무효 approved rows {len(invalid_approved)}건 "
                      "(matched_fighter_id NULL 또는 match_status != 'exact')")
    return issues


# ---------------------------------------------------------------------------
# Dry-run report
# ---------------------------------------------------------------------------

def print_dryrun(batch, staging_rows, fighters, approved, invalid_approved, deduped, duplicates):
    fighter_by_id = {f["id"]: f for f in fighters}

    matched_ids = {r["matched_fighter_id"] for r in staging_rows
                   if r.get("matched_fighter_id") and r.get("match_status") == "exact"}
    unmatched = [f for f in fighters if f["id"] not in matched_ids]

    overwrites = [r for r in deduped
                  if any(fighter_by_id.get(r["matched_fighter_id"], {}).get(c) is not None
                         for c in RAW_STAT_COLS)]

    print(SEP)
    print(f"  DRY-RUN  |  batch: {batch}")
    print(SEP)
    print(f"\n  Staging rows       : {len(staging_rows):,}")
    print(f"  approved (유효)    : {len(approved):,}")
    print(f"  approved (무효)    : {len(invalid_approved):,}")
    print(f"  적용 대상 (중복제거): {len(deduped):,}명")
    print(f"  overwrite 위험     : {len(overwrites):,}건")
    print(f"  중복 fighter       : {len(duplicates):,}건")
    print(f"  미매칭 활성파이터  : {len(unmatched):,}명")

    if duplicates:
        print(f"\n  ⚠ 중복 matched_fighter_id (최신 row 자동 선택)")
        for fid, rows in list(duplicates.items())[:5]:
            ids = [str(r["id"]) for r in rows]
            print(f"    {fid}: staging ids {ids}")

    if overwrites:
        print(f"\n  ⚠ Overwrite 대상 — 현재 raw stat 있는 파이터")
        for r in overwrites[:5]:
            f = fighter_by_id.get(r["matched_fighter_id"], {})
            existing = [c for c in RAW_STAT_COLS if f.get(c) is not None]
            print(f"    {f.get('name', '?')} ({r['matched_fighter_id']}) — 기존: {existing}")

    print(f"\n  샘플 (상위 5명 예상 업데이트)")
    print(f"  {'파이터':<28} {'slpm':>6} {'str_acc':>8} {'sapm':>6} {'td_avg':>7}")
    for r in sorted(deduped, key=lambda x: x["source_name"])[:5]:
        f = fighter_by_id.get(r["matched_fighter_id"])
        name = (f["name_en"] or f["name"] if f else r["source_name"])[:27]
        print(f"  {name:<28} {(r.get('slpm') or 0):>6.2f} "
              f"{(r.get('str_acc') or 0):>8.1f} "
              f"{(r.get('sapm') or 0):>6.2f} "
              f"{(r.get('td_avg') or 0):>7.2f}")

    blocking = check_blocking(approved, invalid_approved)
    print(f"\n  {'BLOCKED' if blocking else 'READY'}")
    for b in blocking:
        print(f"  ✗ {b}")
    if not blocking and approved:
        print(f"  → --execute 플래그로 {len(deduped)}명 적용 가능")
    print(SEP)


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------

def apply(batch, deduped, fighters, dry_run):
    fighter_by_id = {f["id"]: f for f in fighters}
    now_iso = datetime.now(timezone.utc).isoformat()

    success, failed = 0, []
    audit_buffer = []

    print(f"\n[apply] {'DRY-RUN' if dry_run else '실행'} — {len(deduped)}명 대상")

    for i, r in enumerate(sorted(deduped, key=lambda x: x["source_name"]), 1):
        fid = r["matched_fighter_id"]
        f   = fighter_by_id.get(fid)
        if not f:
            print(f"  [{i:4d}] SKIP {fid} — fighters 테이블에 없음")
            continue

        # 업데이트할 값
        patch_body = {col: r.get(col) for col in RAW_STAT_COLS}
        patch_body["stats_updated_at"] = now_iso

        name = f.get("name_en") or f.get("name") or fid
        if dry_run:
            slpm = r.get("slpm") or 0
            print(f"  [{i:4d}] WOULD UPDATE {name:<28} slpm={slpm:.2f}")
            success += 1
            continue

        # 실제 PATCH
        try:
            api_patch("fighters", {"id": f"eq.{fid}"}, patch_body)
            success += 1

            # audit log 버퍼
            before = {col: f.get(col) for col in RAW_STAT_COLS}
            after  = {col: r.get(col) for col in RAW_STAT_COLS}
            audit_buffer.append({
                "action":       "ufc_stats_bulk_apply",
                "entity_table": "fighters",
                "entity_id":    fid,
                "before_data":  before,
                "after_data":   after,
                "metadata": {
                    "import_batch":        batch,
                    "staging_id":          r["id"],
                    "source_name":         r["source_name"],
                    "source_ufc_stats_id": r.get("source_ufc_stats_id"),
                },
            })
            if len(audit_buffer) >= AUDIT_BATCH:
                _flush_audit(audit_buffer)
                audit_buffer.clear()

            if i % 50 == 0:
                print(f"  [{i:4d}] {success} 완료 (latest: {name})")
        except RuntimeError as e:
            print(f"  [{i:4d}] FAIL {name}: {e}", file=sys.stderr)
            failed.append(fid)

    if audit_buffer and not dry_run:
        _flush_audit(audit_buffer)

    return success, failed


def _flush_audit(buffer):
    try:
        api_post("admin_audit_logs", buffer)
    except RuntimeError as e:
        print(f"  [audit] WARN: log flush 실패 ({len(buffer)}건) — {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Apply approved staging rows to fighters raw stat columns"
    )
    parser.add_argument("--batch",   default=BATCH_DEFAULT, help="import_batch 값")
    parser.add_argument("--execute", action="store_true",
                        help="실제 UPDATE 수행 (기본: dry-run)")
    args = parser.parse_args()

    is_dry_run = not args.execute

    if not is_dry_run:
        print("⚠  --execute 모드: fighters 테이블 raw stat UPDATE가 실행됩니다.")
        confirm = input("계속하려면 'YES'를 입력하세요: ").strip()
        if confirm != "YES":
            print("취소됨.")
            sys.exit(0)

    print(f"[load] staging rows (batch={args.batch}) ...", end=" ", flush=True)
    staging = load_staging(args.batch)
    print(f"{len(staging)}행")

    print(f"[load] fighters ...", end=" ", flush=True)
    fighters = load_fighters()
    print(f"{len(fighters)}명")

    approved, invalid_approved = classify(staging)
    duplicates = find_duplicates(approved)
    deduped    = deduplicate(approved)

    # dry-run 리포트
    print_dryrun(args.batch, staging, fighters, approved, invalid_approved, deduped, duplicates)

    # blocking 체크
    blocking = check_blocking(approved, invalid_approved)
    if blocking:
        print("\n실행 불가: blocking 조건 미충족")
        sys.exit(1)

    if is_dry_run:
        print("\n[dry-run 완료] 실제 변경 없음. 적용하려면 --execute 플래그 사용.")
        sys.exit(0)

    # --- 실제 apply ---
    success, failed = apply(args.batch, deduped, fighters, dry_run=False)

    print(f"\n{SEP}")
    print(f"  APPLY 완료")
    print(f"  성공: {success}명")
    if failed:
        print(f"  실패: {len(failed)}명")
        for fid in failed:
            print(f"    - {fid}")
    print(SEP)

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
