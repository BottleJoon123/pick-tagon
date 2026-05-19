"""
rescrape_failed.py — error CSV에 기록된 실패 URL 재수집 후 메인 CSV에 추가
사용법: python scripts/rescrape_failed.py
"""
import csv, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from scrape_ufcstats import scrape_fighter_detail, _sleep, HEADERS, CSV_FIELDS
import requests

BASE    = os.path.join(os.path.dirname(__file__), "..")
ERR_CSV = os.path.join(BASE, "data", "ufcstats_scrape_errors.csv")
OUT_CSV = os.path.join(BASE, "data", "ufcstats_fighters_raw.csv")

def main():
    if not os.path.exists(ERR_CSV):
        print("No error CSV found.")
        return

    with open(ERR_CSV, encoding="utf-8") as f:
        err_rows = list(csv.DictReader(f))

    print(f"Re-scraping {len(err_rows)} failed fighters...")
    session = requests.Session()
    success, still_failed = [], []

    for r in err_rows:
        name_en, url = r["name_en"], r["profile_url"]
        print(f"  {name_en} ...")
        try:
            row = scrape_fighter_detail(name_en, url, session)
            success.append(row)
            print(f"    OK: slpm={row['slpm']} str_acc={row['str_acc']}")
        except Exception as e:
            still_failed.append({**r, "error": str(e)})
            print(f"    FAIL: {e}")
        _sleep()

    # append to main CSV
    if success:
        with open(OUT_CSV, "a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
            w.writerows(success)
        print(f"\nAppended {len(success)} rows to {OUT_CSV}")

    # overwrite error CSV with remaining failures
    with open(ERR_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["name_en","profile_url","error","scraped_at"])
        w.writeheader()
        w.writerows(still_failed)
    print(f"Remaining failures: {len(still_failed)}")

if __name__ == "__main__":
    main()
