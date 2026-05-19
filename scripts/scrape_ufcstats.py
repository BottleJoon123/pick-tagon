"""
scrape_ufcstats.py
------------------
UFCStats.com 에서 fighter raw stat을 수집하여 CSV로 저장한다.

수집 필드:
  ufc_stats_id, name_en, slpm, str_acc, sapm, str_def,
  td_avg, td_acc, td_def, sub_avg, scraped_at

사용법:
  python scripts/scrape_ufcstats.py
  python scripts/scrape_ufcstats.py --limit 50     # 테스트: 처음 50명만
  python scripts/scrape_ufcstats.py --chars abc     # 특정 알파벳만

출력:
  data/ufcstats_fighters_raw.csv
  data/ufcstats_scrape_errors.csv
"""

import argparse
import csv
import os
import re
import sys
import time
import random
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# ─── 설정 ────────────────────────────────────────────────────────────────────

BASE_URL   = "http://ufcstats.com"
LIST_URL   = BASE_URL + "/statistics/fighters?char={char}&page=all"
CHARS      = "abcdefghijklmnopqrstuvwxyz"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

DELAY_MIN  = 0.35   # 요청 간 최소 대기 (초)
DELAY_MAX  = 0.70   # 요청 간 최대 대기 (초)
RETRY_MAX  = 3      # 실패 시 최대 재시도 횟수
RETRY_WAIT = 3.0    # 재시도 대기 (초)
TIMEOUT    = 15     # HTTP 타임아웃 (초)

OUT_DIR       = os.path.join(os.path.dirname(__file__), "..", "data")
OUT_CSV       = os.path.join(OUT_DIR, "ufcstats_fighters_raw.csv")
ERR_CSV       = os.path.join(OUT_DIR, "ufcstats_scrape_errors.csv")

CSV_FIELDS = [
    "ufc_stats_id", "name_en", "profile_url",
    "slpm", "str_acc", "sapm", "str_def",
    "td_avg", "td_acc", "td_def", "sub_avg",
    "scraped_at",
]

# stat label → CSV 컬럼 매핑
STAT_MAP = {
    "SLpM":     "slpm",
    "Str. Acc.":"str_acc",
    "SApM":     "sapm",
    "Str. Def": "str_def",
    "TD Avg.":  "td_avg",
    "TD Acc.":  "td_acc",
    "TD Def.":  "td_def",
    "Sub. Avg.":"sub_avg",
}

# ─── 유틸리티 ─────────────────────────────────────────────────────────────────

def _sleep():
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def _get(url, session):
    """GET with retry. Returns Response or raises on final failure."""
    for attempt in range(1, RETRY_MAX + 1):
        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            if attempt < RETRY_MAX:
                wait = RETRY_WAIT * attempt
                print(f"    [retry {attempt}/{RETRY_MAX}] {e} — wait {wait}s")
                time.sleep(wait)
            else:
                raise


def _parse_stat_value(raw):
    """
    '40%'  → 40.0
    '4.66' → 4.66
    '0.0'  → 0.0
    '--'   → None
    ''     → None
    """
    v = raw.strip().rstrip("%")
    if v in ("", "--", "-"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _extract_ufc_stats_id(url):
    """'http://ufcstats.com/fighter-details/93fe7332d16c6ad9' → '93fe7332d16c6ad9'"""
    return urlparse(url).path.rstrip("/").split("/")[-1]


# ─── 리스트 페이지 스크래핑 ──────────────────────────────────────────────────

def scrape_fighter_list(char, session):
    """
    Returns list of (name_en, profile_url) for all fighters
    starting with `char`. Deduplicates by URL.
    """
    url = LIST_URL.format(char=char)
    resp = _get(url, session)
    soup = BeautifulSoup(resp.text, "html.parser")

    seen_urls = set()
    fighters = []

    table = soup.find("table", class_="b-statistics__table")
    if not table:
        return fighters

    for row in table.find_all("tr"):
        tds = row.find_all("td")
        if len(tds) < 2:
            continue

        # 첫 번째 링크 = fighter detail URL
        link = row.find("a", href=re.compile(r"/fighter-details/"))
        if not link:
            continue

        profile_url = link["href"].strip()
        if profile_url in seen_urls:
            continue
        seen_urls.add(profile_url)

        first = tds[0].get_text(strip=True)
        last  = tds[1].get_text(strip=True)
        name_en = (first + " " + last).strip()

        fighters.append((name_en, profile_url))

    return fighters


# ─── 상세 페이지 스크래핑 ─────────────────────────────────────────────────────

def scrape_fighter_detail(name_en, profile_url, session):
    """
    Returns dict with all CSV_FIELDS populated (None if missing).
    Raises on HTTP/parse error.
    """
    resp = _get(profile_url, session)
    soup = BeautifulSoup(resp.text, "html.parser")

    # 이름 (detail 페이지 기준 — 목록과 다를 수 있으므로 재추출)
    name_el = soup.select_one("span.b-content__title-highlight")
    canonical_name = name_el.get_text(strip=True) if name_el else name_en

    stats = {col: None for col in CSV_FIELDS}
    stats["ufc_stats_id"]  = _extract_ufc_stats_id(profile_url)
    stats["name_en"]       = canonical_name
    stats["profile_url"]   = profile_url
    stats["scraped_at"]    = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for item in soup.select("li.b-list__box-list-item"):
        title_el = item.select_one("i.b-list__box-item-title")
        if not title_el:
            continue
        label = title_el.get_text(strip=True).rstrip(":")
        if label not in STAT_MAP:
            continue
        # value = full text minus the label
        raw_text = item.get_text(" ", strip=True)
        raw_val  = raw_text.replace(title_el.get_text(strip=True), "").strip()
        stats[STAT_MAP[label]] = _parse_stat_value(raw_val)

    return stats


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape UFCStats.com fighter raw stats to CSV.")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max fighters to scrape (0 = all)")
    parser.add_argument("--chars", type=str, default=CHARS,
                        help="Which alphabet chars to scrape (e.g. 'abc')")
    parser.add_argument("--out", type=str, default=OUT_CSV,
                        help="Output CSV path")
    parser.add_argument("--errors", type=str, default=ERR_CSV,
                        help="Error log CSV path")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)

    session = requests.Session()

    # ── Phase 1: 리스트 페이지에서 파이터 URL 수집 ─────────────────────────
    print("=" * 60)
    print("Phase 1: Collecting fighter URLs from list pages")
    print("=" * 60)

    all_fighters = []
    seen_urls = set()

    for char in args.chars:
        print(f"  [{char}] fetching list ...", end=" ", flush=True)
        try:
            fighters = scrape_fighter_list(char, session)
            new = [(n, u) for n, u in fighters if u not in seen_urls]
            for n, u in new:
                seen_urls.add(u)
            all_fighters.extend(new)
            print(f"{len(new)} fighters  (total: {len(all_fighters)})")
        except Exception as e:
            print(f"ERROR: {e}")
        _sleep()

    print(f"\nTotal unique fighters to scrape: {len(all_fighters)}")

    if args.limit > 0:
        all_fighters = all_fighters[:args.limit]
        print(f"  (limited to {args.limit} by --limit flag)")

    # ── Phase 2: 상세 페이지 스크래핑 ─────────────────────────────────────
    print("\n" + "=" * 60)
    print("Phase 2: Scraping fighter detail pages")
    print("=" * 60)

    errors = []
    out_rows = []

    with open(args.out, "w", newline="", encoding="utf-8") as out_f:
        writer = csv.DictWriter(out_f, fieldnames=CSV_FIELDS)
        writer.writeheader()

        for idx, (name_en, profile_url) in enumerate(all_fighters, 1):
            if idx % 100 == 0 or idx == 1:
                print(f"  [{idx}/{len(all_fighters)}] processing ...")

            try:
                row = scrape_fighter_detail(name_en, profile_url, session)
                writer.writerow(row)
                out_f.flush()
                out_rows.append(row)
            except Exception as e:
                errors.append({
                    "name_en": name_en,
                    "profile_url": profile_url,
                    "error": str(e),
                    "scraped_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                })
                print(f"  ERROR [{idx}] {name_en}: {e}")

            _sleep()

    # ── 에러 로그 저장 ──────────────────────────────────────────────────────
    if errors:
        with open(args.errors, "w", newline="", encoding="utf-8") as err_f:
            writer_e = csv.DictWriter(err_f, fieldnames=["name_en", "profile_url", "error", "scraped_at"])
            writer_e.writeheader()
            writer_e.writerows(errors)

    # ── 최종 요약 ───────────────────────────────────────────────────────────
    stat_cols = ["slpm", "str_acc", "sapm", "str_def",
                 "td_avg", "td_acc", "td_def", "sub_avg"]

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Total scraped rows : {len(out_rows)}")
    print(f"  Errors             : {len(errors)}")
    print(f"  Output CSV         : {os.path.abspath(args.out)}")
    if errors:
        print(f"  Error CSV          : {os.path.abspath(args.errors)}")

    print("\n  Null counts per stat column:")
    for col in stat_cols:
        null_n = sum(1 for r in out_rows if r.get(col) is None)
        total  = len(out_rows)
        pct    = null_n / total * 100 if total else 0
        print(f"    {col:<12}: {null_n:4d} / {total} null  ({pct:.1f}%)")

    all_null = sum(
        1 for r in out_rows
        if all(r.get(c) is None for c in stat_cols)
    )
    any_stat = sum(
        1 for r in out_rows
        if any(r.get(c) is not None for c in stat_cols)
    )
    print(f"\n  Fighters with all stats null : {all_null}")
    print(f"  Fighters with any stat       : {any_stat}")
    print("=" * 60)


if __name__ == "__main__":
    main()
