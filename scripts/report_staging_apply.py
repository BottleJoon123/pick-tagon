"""
report_staging_apply.py
-----------------------
fighter_stats_staging → fighters apply 전 상태 리포트 (읽기 전용)

사용법:
  set SUPABASE_URL=https://rnnrimzrypayvnmznpin.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

  python scripts/report_staging_apply.py
  python scripts/report_staging_apply.py --batch ufcstats_20260519

출력 항목:
  - Approved rows 요약 (총수, 유효/무효 분류)
  - 중복 matched_fighter_id 감지 (같은 파이터에 2개 이상 staging row)
  - overwrite 위험도 (현재 fighters raw stat이 이미 채워진 케이스)
  - 미매칭 현역 파이터 목록
  - apply 대상 샘플 (10명 before/after 예상)

주의: 이 스크립트는 읽기 전용. DB 변경 없음.
"""

import argparse
import os
import sys

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rnnrimzrypayvnmznpin.supabase.co")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

BATCH_DEFAULT = "ufcstats_20260519"
RAW_STAT_COLS = ["slpm", "str_acc", "sapm", "str_def", "td_avg", "td_acc", "td_def", "sub_avg"]
SEP = "=" * 60


# ---------------------------------------------------------------------------
# REST helpers
# ---------------------------------------------------------------------------

def headers():
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY 환경변수 필요", file=sys.stderr)
        sys.exit(1)
    return {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    }


def api_get(path, params=None):
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/{path}",
                        headers=headers(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


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
        "select":       "id,matched_fighter_id,match_status,match_reason,match_confidence,"
                        "approved,source_name,source_ufc_stats_id,"
                        "slpm,str_acc,sapm,str_def,td_avg,td_acc,td_def,sub_avg",
        "import_batch": f"eq.{batch}",
    })


def load_fighters():
    return paginate("fighters", {
        "select": "id,name,name_en,division,"
                  "slpm,str_acc,sapm,str_def,td_avg,td_acc,td_def,sub_avg",
    })


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------

def classify_staging(rows):
    approved, pending, invalid_approved = [], [], []
    for r in rows:
        if r.get("approved"):
            if r.get("matched_fighter_id") and r.get("match_status") == "exact":
                approved.append(r)
            else:
                invalid_approved.append(r)
        else:
            pending.append(r)
    return approved, pending, invalid_approved


def find_duplicates(approved_rows):
    by_fighter = {}
    for r in approved_rows:
        fid = r["matched_fighter_id"]
        by_fighter.setdefault(fid, []).append(r)
    return {fid: rows for fid, rows in by_fighter.items() if len(rows) > 1}


def deduplicate(approved_rows):
    """중복 matched_fighter_id 중 id 최대(최신) row 1개만 선택"""
    by_fighter = {}
    for r in approved_rows:
        fid = r["matched_fighter_id"]
        if fid not in by_fighter or r["id"] > by_fighter[fid]["id"]:
            by_fighter[fid] = r
    return list(by_fighter.values())


def overwrite_analysis(deduped_rows, fighter_by_id):
    will_overwrite, clean = [], []
    for r in deduped_rows:
        f = fighter_by_id.get(r["matched_fighter_id"])
        if not f:
            continue
        currently_set = [c for c in RAW_STAT_COLS if f.get(c) is not None]
        if currently_set:
            will_overwrite.append({"staging": r, "fighter": f, "existing_cols": currently_set})
        else:
            clean.append(r)
    return will_overwrite, clean


def unmatched_active(fighters, matched_ids):
    return [f for f in fighters if f["id"] not in matched_ids]


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(batch, staging_rows, fighters):
    fighter_by_id = {f["id"]: f for f in fighters}
    matched_ids   = {r["matched_fighter_id"] for r in staging_rows
                     if r.get("matched_fighter_id") and r.get("match_status") == "exact"}

    approved, pending, invalid_approved = classify_staging(staging_rows)
    duplicates = find_duplicates(approved)
    deduped    = deduplicate(approved)
    overwrites, clean_rows = overwrite_analysis(deduped, fighter_by_id)
    unmatched  = unmatched_active(fighters, matched_ids)

    print(SEP)
    print(f"  STAGING APPLY DRY-RUN REPORT  |  batch: {batch}")
    print(SEP)

    # --- 1. Staging 요약 ---
    print("\n[1] Staging 요약")
    print(f"  전체 staging rows   : {len(staging_rows):,}")
    print(f"  approved=true       : {len(approved) + len(invalid_approved):,}")
    print(f"    유효 (적용 가능)  : {len(approved):,}")
    print(f"    무효 (조건 불충족): {len(invalid_approved):,}")
    print(f"  pending (미승인)    : {len(pending):,}")
    print(f"  중복 제거 후 대상   : {len(deduped):,}명")

    # --- 2. 무효 approved rows ---
    if invalid_approved:
        print(f"\n[2] ⚠ 무효 approved rows ({len(invalid_approved)}건) — 적용 불가")
        for r in invalid_approved[:10]:
            print(f"    id={r['id']}  name={r['source_name']}"
                  f"  fighter_id={r.get('matched_fighter_id')}  status={r.get('match_status')}")
        if len(invalid_approved) > 10:
            print(f"    ... 외 {len(invalid_approved) - 10}건")
    else:
        print("\n[2] 무효 approved rows: 없음 ✓")

    # --- 3. 중복 matched_fighter_id ---
    if duplicates:
        print(f"\n[3] ⚠ 중복 matched_fighter_id ({len(duplicates)}건) — 최신 row(최대 id) 우선 적용")
        for fid, rows in list(duplicates.items())[:10]:
            names = " | ".join(r["source_name"] for r in rows)
            ids   = " | ".join(str(r["id"]) for r in rows)
            print(f"    fighter={fid}  staging_ids=[{ids}]  names=[{names}]")
    else:
        print("\n[3] 중복 matched_fighter_id: 없음 ✓")

    # --- 4. Overwrite 위험 ---
    if overwrites:
        print(f"\n[4] ⚠ Overwrite 위험 ({len(overwrites)}건) — 이미 raw stat이 있는 파이터")
        for item in overwrites[:10]:
            f = item["fighter"]
            print(f"    {f['name']} ({f['id']})  기존 컬럼: {item['existing_cols']}")
        if len(overwrites) > 10:
            print(f"    ... 외 {len(overwrites) - 10}건")
    else:
        print("\n[4] Overwrite 위험: 없음 ✓  (대상 파이터 raw stat 전부 NULL)")

    # --- 5. Apply 대상 요약 ---
    print(f"\n[5] Apply 대상 요약")
    print(f"  업데이트 예정 파이터 수: {len(deduped):,}")
    has_nonzero = sum(1 for r in deduped if any(r.get(c) not in (None, 0.0) for c in RAW_STAT_COLS))
    all_zero    = len(deduped) - has_nonzero
    print(f"  실측 stat 보유 (slpm>0 등): {has_nonzero:,}")
    print(f"  전 stat 0.0 (UFC 경기 없음): {all_zero:,}")

    # --- 6. 미매칭 활성 파이터 ---
    print(f"\n[6] 미매칭 활성 파이터: {len(unmatched)}명")
    if unmatched:
        by_div = {}
        for f in unmatched:
            by_div.setdefault(f.get("division", "?"), []).append(f["name_en"] or f["name"])
        for div in sorted(by_div):
            names = ", ".join(by_div[div][:5])
            more  = f" +{len(by_div[div])-5}" if len(by_div[div]) > 5 else ""
            print(f"    [{div}] {names}{more}")

    # --- 7. Apply 예상 샘플 ---
    print(f"\n[7] Apply 예상 샘플 (상위 10명)")
    print(f"  {'파이터':<30} {'slpm':>6} {'str_acc':>8} {'sapm':>6} {'td_avg':>7}")
    print(f"  {'-'*30} {'-'*6} {'-'*8} {'-'*6} {'-'*7}")
    for r in sorted(deduped, key=lambda x: x["source_name"])[:10]:
        f = fighter_by_id.get(r["matched_fighter_id"])
        name = (f["name_en"] or f["name"] if f else r["source_name"])[:29]
        print(f"  {name:<30} {(r.get('slpm') or 0):>6.2f} "
              f"{(r.get('str_acc') or 0):>8.1f} "
              f"{(r.get('sapm') or 0):>6.2f} "
              f"{(r.get('td_avg') or 0):>7.2f}")

    # --- BLOCKING 체크 요약 ---
    print(f"\n{SEP}")
    blocking = []
    if len(approved) == 0 and len(invalid_approved) == 0:
        blocking.append("approved=true 행 없음 — 아직 아무것도 승인되지 않았음")
    if invalid_approved:
        blocking.append(f"무효 approved rows {len(invalid_approved)}건 존재")

    warnings = []
    if duplicates:
        warnings.append(f"중복 matched_fighter_id {len(duplicates)}건 (최신 row 자동 선택)")
    if overwrites:
        warnings.append(f"raw stat overwrite {len(overwrites)}건")

    if blocking:
        print("  STATUS: BLOCKED")
        for b in blocking:
            print(f"  ✗ {b}")
    elif len(approved) == 0:
        print("  STATUS: NOT READY  (approved=true 행 없음)")
    else:
        print("  STATUS: READY TO APPLY")
        print(f"  → {len(deduped)}명 파이터 raw stat 업데이트 예정")

    for w in warnings:
        print(f"  ⚠ {w}")
    print(SEP)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Staging apply dry-run report (read-only)")
    parser.add_argument("--batch", default=BATCH_DEFAULT, help="import_batch 값")
    args = parser.parse_args()

    print(f"[load] staging rows (batch={args.batch}) ...", end=" ", flush=True)
    staging = load_staging(args.batch)
    print(f"{len(staging)}행")

    print(f"[load] fighters ...", end=" ", flush=True)
    fighters = load_fighters()
    print(f"{len(fighters)}명")

    print()
    print_report(args.batch, staging, fighters)


if __name__ == "__main__":
    main()
