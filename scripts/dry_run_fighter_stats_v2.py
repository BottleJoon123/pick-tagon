"""
dry_run_fighter_stats_v2.py
----------------------------
Fighter stats scoring v2 formula — read-only dry-run.

Loads fighters from Supabase, computes v1 and v2 stats side-by-side,
and writes a markdown comparison report.

DB WRITES: NONE.  Uses GET requests only. fighters.stats[] is never modified.
admin_recompute_fighter_stats() is never called.

Usage:
  python scripts/dry_run_fighter_stats_v2.py
  python scripts/dry_run_fighter_stats_v2.py --out reports/v2_dry_run.md
  python scripts/dry_run_fighter_stats_v2.py --notable-only

Credentials (tried in order):
  1. .env.local  — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
                   or VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
  2. Environment variables (same key names)
"""

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Env loading
# ---------------------------------------------------------------------------

def _load_dotenv(path=".env.local"):
    env = {}
    p = Path(path)
    if not p.exists():
        return env
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _get_credentials():
    env = _load_dotenv()
    # service role key takes priority (full read access)
    url = env.get("SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if url and key:
        return url, key
    # fall back to Vite anon key (public read on fighters table)
    url = env.get("VITE_SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = env.get("VITE_SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    if url and key:
        return url, key
    print("ERROR: Supabase credentials not found.", file=sys.stderr)
    print("  Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local or environment.", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# REST helpers (read-only)
# ---------------------------------------------------------------------------

_SUPABASE_URL = None
_API_KEY = None


def _headers():
    return {
        "apikey":        _API_KEY,
        "Authorization": f"Bearer {_API_KEY}",
    }


def paginate(table, params):
    rows, offset = [], 0
    while True:
        r = requests.get(
            f"{_SUPABASE_URL}/rest/v1/{table}",
            headers=_headers(),
            params=dict(params, limit=1000, offset=offset),
            timeout=30,
        )
        r.raise_for_status()
        chunk = r.json()
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


# ---------------------------------------------------------------------------
# V1 baselines (mirrors admin.js FIGHTER_STAT_FALLBACK_BASELINES exactly)
# ---------------------------------------------------------------------------

V1_BL = {
    "slpm":     {"p05": 1.5,  "p95": 7.5},
    "str_acc":  {"p05": 28,   "p95": 62},
    "sapm":     {"p05": 1.5,  "p95": 6.5},
    "str_def":  {"p05": 45,   "p95": 76},
    "td_avg":   {"p05": 0.0,  "p95": 4.5},
    "td_acc":   {"p05": 15,   "p95": 70},
    "td_def":   {"p05": 40,   "p95": 88},
    "sub_avg":  {"p05": 0.0,  "p95": 2.5},
    "ko_rate":  {"p05": 0,    "p95": 60},
    "sub_rate": {"p05": 0,    "p95": 35},
    "dec_rate": {"p05": 20,   "p95": 80},
}

# ---------------------------------------------------------------------------
# V2 baselines (adjusted to fix floor crowding)
# Changes vs v1:
#   td_avg  p95: 4.5 → 2.8  (grappling floor fix — main change)
#   sub_avg p95: 2.5 → 1.5  (grappling floor fix)
#   td_acc  p95: 70  → 65   (minor tighten)
#   sapm    p95: 6.5 → 5.5  (stamina floor improvement)
#   str_def p05/p95: 45/76 → 42/71  (defense floor fix)
#   td_def  p05/p95: 40/88 → 38/83  (defense floor fix)
#   str_acc p95: 62  → 60   (minor tighten)
#   ko_rate p95: 60  → 55   (slight tighten)
#   sub_rate p95: 35 → 30   (slight tighten)
#   dec_rate p05: 20 → 15   (expand lower range)
# ---------------------------------------------------------------------------

V2_BL = {
    "slpm":     {"p05": 1.5,  "p95": 7.5},   # unchanged
    "str_acc":  {"p05": 28,   "p95": 60},
    "sapm":     {"p05": 1.5,  "p95": 5.5},
    "str_def":  {"p05": 42,   "p95": 71},
    "td_avg":   {"p05": 0.0,  "p95": 2.8},   # KEY FIX for grappling floor
    "td_acc":   {"p05": 15,   "p95": 65},
    "td_def":   {"p05": 38,   "p95": 83},
    "sub_avg":  {"p05": 0.0,  "p95": 1.5},   # KEY FIX for grappling floor
    "ko_rate":  {"p05": 0,    "p95": 55},
    "sub_rate": {"p05": 0,    "p95": 30},
    "dec_rate": {"p05": 15,   "p95": 80},
}

STAT_NAMES = ["Striking", "Grappling", "Stamina", "Defense", "Speed"]

# ---------------------------------------------------------------------------
# Shared formula primitives
# ---------------------------------------------------------------------------

def _n(val, key, bl):
    """Normalize: higher raw = higher score."""
    if val is None:
        return None
    try:
        val = float(val)
    except (TypeError, ValueError):
        return None
    r = bl.get(key)
    if not r:
        return None
    span = r["p95"] - r["p05"]
    if span <= 0:
        return 50
    return max(0.0, min(100.0, (val - r["p05"]) / span * 100))


def _ni(val, key, bl):
    """Inverse normalize: lower raw = higher score (e.g. sapm)."""
    if val is None:
        return None
    try:
        val = float(val)
    except (TypeError, ValueError):
        return None
    r = bl.get(key)
    if not r:
        return None
    span = r["p95"] - r["p05"]
    if span <= 0:
        return 50
    return max(0.0, min(100.0, (r["p95"] - val) / span * 100))


def _wa(pairs):
    """Weighted average, ignoring None components (not treated as 0)."""
    w_sum = v_sum = 0.0
    for val, w in pairs:
        if val is not None:
            w_sum += w
            v_sum += val * w
    return round(v_sum / w_sum) if w_sum > 0 else 50


# ---------------------------------------------------------------------------
# V1 formula (exact mirror of admin.js computeStatsFromPerf)
# ---------------------------------------------------------------------------

def compute_v1(f):
    bl = V1_BL
    s = _wa([(_n(f.get("slpm"),    "slpm",    bl), 0.55),
             (_n(f.get("str_acc"), "str_acc", bl), 0.45)])
    g = _wa([(_n(f.get("td_avg"),  "td_avg",  bl), 0.45),
             (_n(f.get("td_acc"),  "td_acc",  bl), 0.35),
             (_n(f.get("sub_avg"), "sub_avg", bl), 0.20)])
    st = _wa([(_ni(f.get("sapm"),   "sapm",     bl), 0.60),
              (_n(f.get("dec_rate"),"dec_rate", bl), 0.40)])
    d = _wa([(_n(f.get("str_def"), "str_def", bl), 0.60),
             (_n(f.get("td_def"),  "td_def",  bl), 0.40)])
    sp = _wa([(_n(f.get("slpm"),    "slpm",    bl), 0.40),
              (_n(f.get("ko_rate"), "ko_rate", bl), 0.35),
              (_n(f.get("str_acc"), "str_acc", bl), 0.25)])
    return [max(45, min(98, x)) for x in [s, g, st, d, sp]]


# ---------------------------------------------------------------------------
# V2 formula
# ---------------------------------------------------------------------------

def _rank_bonus(rank):
    if rank is None: return 0
    if rank == 0:    return 8   # champion
    if rank <= 3:    return 5   # top contenders
    if rank <= 10:   return 3   # ranked
    if rank <= 15:   return 1   # fringe ranked
    return 0


def _prestige_floor(rank):
    if rank is None: return 45
    if rank == 0:    return 62
    if rank <= 3:    return 56
    if rank <= 10:   return 50
    if rank <= 15:   return 47
    return 45


def _record_confidence(wins, losses, draws):
    """
    Dampens scores toward 50 for fighters with limited recorded fights.
    Prevents inflated ratings from low-sample extremes (e.g. 1-fight KO artists).
    """
    total = (wins or 0) + (losses or 0) + (draws or 0)
    if total >= 10: return 1.00
    if total >= 5:  return 0.85
    if total >= 2:  return 0.70
    return 0.55


def compute_v2(f):
    bl = V2_BL
    rank  = f.get("rank")
    wins  = f.get("wins",  0) or 0
    losses = f.get("losses", 0) or 0
    draws  = f.get("draws",  0) or 0

    # Raw scores with v2 baselines (same formula structure as v1)
    s_raw = _wa([(_n(f.get("slpm"),    "slpm",    bl), 0.55),
                 (_n(f.get("str_acc"), "str_acc", bl), 0.45)])
    g_raw = _wa([(_n(f.get("td_avg"),  "td_avg",  bl), 0.45),
                 (_n(f.get("td_acc"),  "td_acc",  bl), 0.35),
                 (_n(f.get("sub_avg"), "sub_avg", bl), 0.20)])
    st_raw = _wa([(_ni(f.get("sapm"),    "sapm",     bl), 0.60),
                  (_n(f.get("dec_rate"), "dec_rate", bl), 0.40)])
    d_raw = _wa([(_n(f.get("str_def"), "str_def", bl), 0.60),
                 (_n(f.get("td_def"),  "td_def",  bl), 0.40)])
    sp_raw = _wa([(_n(f.get("slpm"),    "slpm",    bl), 0.40),
                  (_n(f.get("ko_rate"), "ko_rate", bl), 0.35),
                  (_n(f.get("str_acc"), "str_acc", bl), 0.25)])

    raw = [s_raw, g_raw, st_raw, d_raw, sp_raw]

    # Record confidence dampener (pull toward 50 for low-sample fighters)
    conf = _record_confidence(wins, losses, draws)
    dampened = [round(r * conf + 50 * (1 - conf)) for r in raw]

    # Prestige bonus (rank-based flat add)
    bonus = _rank_bonus(rank)
    scored = [d + bonus for d in dampened]

    # Finish rate supplement
    ko_rate  = float(f.get("ko_rate")  or 0)
    sub_rate = float(f.get("sub_rate") or 0)
    if ko_rate > 60:
        scored[4] += 3  # Speed bonus for high KO rate
    if sub_rate > 30:
        scored[1] += 3  # Grappling bonus for submission finishers

    # Floor + ceiling
    floor = _prestige_floor(rank)
    return [max(floor, min(98, x)) for x in scored]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_fighters():
    print("[load] fighters ...", end=" ", flush=True)
    rows = paginate("fighters", {
        "select": (
            "id,name,name_en,division,rank,wins,losses,draws,"
            "slpm,str_acc,sapm,str_def,td_avg,td_acc,td_def,sub_avg,"
            "ko_rate,dec_rate,sub_rate,stats"
        ),
    })
    print(f"{len(rows)}명")
    return rows


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

def compare(fighters):
    results = []
    for f in fighters:
        db_stats = f.get("stats") or []
        v1 = compute_v1(f)
        v2 = compute_v2(f)
        # db_stats from DB is already v1 (computed 2026-05-23)
        db = [int(x) for x in db_stats] if len(db_stats) >= 5 else v1

        delta = [v2[i] - db[i] for i in range(5)]
        results.append({
            "id":       f["id"],
            "name":     f.get("name_en") or f.get("name") or f["id"],
            "division": f.get("division") or "?",
            "rank":     f.get("rank"),
            "wins":     f.get("wins", 0),
            "losses":   f.get("losses", 0),
            "draws":    f.get("draws", 0),
            "db":       db,
            "v1":       v1,
            "v2":       v2,
            "delta":    delta,
            "avg_delta": round(sum(delta) / 5, 1),
        })
    return results


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def _fmt_stats(stats):
    return f"[{','.join(str(x) for x in stats)}]"


def _fmt_delta(delta):
    parts = []
    for d in delta:
        if d > 0:
            parts.append(f"+{d}")
        elif d < 0:
            parts.append(str(d))
        else:
            parts.append("0")
    return "[" + ",".join(parts) + "]"


NOTABLE_IDS = {
    "khamzat-chimaev",
    "sean-strickland",
    "ilia-topuria",
    "joshua-van",
    "islam-makhachev",
    "tom-aspinall",
    "jon-jones",
    "alexander-volkanovski",
    "carlos-ulberg",
    "petr-yan",
}


def _find_notable_unranked(results):
    """Pick one unranked low-fight-count fighter with interesting delta."""
    candidates = [
        r for r in results
        if r["rank"] is None
        and (r["wins"] + r["losses"] + r["draws"]) <= 5
        and r["db"][4] >= 90  # high speed in v1 (likely over-inflated)
    ]
    return sorted(candidates, key=lambda x: -x["db"][4])[:1]


def generate_report(results, run_ts):
    lines = []
    ts = run_ts.strftime("%Y-%m-%d %H:%M UTC")

    total = len(results)
    ranked = [r for r in results if r["rank"] is not None and r["rank"] != 0]
    champions = [r for r in results if r["rank"] == 0]
    unranked = [r for r in results if r["rank"] is None]

    avg_delta_by_stat = [
        round(sum(r["delta"][i] for r in results) / total, 1)
        for i in range(5)
    ]

    by_avg_delta = sorted(results, key=lambda x: -x["avg_delta"])
    top_increases = by_avg_delta[:30]
    top_decreases = sorted(results, key=lambda x: x["avg_delta"])[:30]

    floor_counts_v1 = [
        sum(1 for r in results if r["db"][i] == 45) for i in range(5)
    ]
    floor_counts_v2 = [
        sum(1 for r in results if r["v2"][i] <= 47) for i in range(5)
    ]

    lines += [
        "# Fighter Stats Scoring V2 — Dry-Run Report",
        f"> 생성: {ts}",
        f"> origin/main HEAD: (실행 시점 기준)",
        "> ⚠️ **운영 반영 없음** — fighters.stats[] 미변경. 비교용 수치만.",
        "",
        "---",
        "",
        "## 1. 분석 요약",
        "",
        f"| 항목 | 값 |",
        f"|---|---|",
        f"| 총 파이터 | {total} |",
        f"| 챔피언 (rank=0) | {len(champions)} |",
        f"| 랭커 (rank=1~15) | {len(ranked)} |",
        f"| 언랭크 | {len(unranked)} |",
        "",
        "### v1 floor=45 집중 (개선 전)",
        "",
        "| Stat | floor=45 수 | 비율 |",
        "|---|---|---|",
    ]
    for i, name in enumerate(STAT_NAMES):
        pct = round(floor_counts_v1[i] / total * 100, 1)
        lines.append(f"| {name} | {floor_counts_v1[i]} | {pct}% |")

    lines += [
        "",
        "### v2 floor=45~47 집중 (개선 후)",
        "",
        "| Stat | floor≤47 수 | 비율 | vs v1 |",
        "|---|---|---|---|",
    ]
    for i, name in enumerate(STAT_NAMES):
        pct = round(floor_counts_v2[i] / total * 100, 1)
        diff = floor_counts_v2[i] - floor_counts_v1[i]
        lines.append(f"| {name} | {floor_counts_v2[i]} | {pct}% | {diff:+d} |")

    lines += [
        "",
        "### Stat별 평균 delta (v2 − v1)",
        "",
        "| Stat | avg delta |",
        "|---|---|",
    ]
    for i, name in enumerate(STAT_NAMES):
        lines.append(f"| {name} | {avg_delta_by_stat[i]:+.1f} |")

    # ------------------------------------------------------------------
    # Tier avg stats comparison
    # ------------------------------------------------------------------
    lines += ["", "---", "", "## 2. Rank Tier별 평균 비교", ""]

    for tier_label, tier_filter in [
        ("champion(0)", lambda r: r["rank"] == 0),
        ("top3(1-3)",   lambda r: r["rank"] is not None and 1 <= r["rank"] <= 3),
        ("ranked(4-10)",lambda r: r["rank"] is not None and 4 <= r["rank"] <= 10),
        ("ranked(11-15)",lambda r: r["rank"] is not None and 11 <= r["rank"] <= 15),
        ("unranked",    lambda r: r["rank"] is None),
    ]:
        tier_rows = [r for r in results if tier_filter(r)]
        if not tier_rows:
            continue
        n = len(tier_rows)
        v1_avg = [round(sum(r["db"][i] for r in tier_rows) / n, 1) for i in range(5)]
        v2_avg = [round(sum(r["v2"][i] for r in tier_rows) / n, 1) for i in range(5)]
        lines.append(f"### {tier_label} (n={n})")
        lines.append("")
        lines.append("| | Striking | Grappling | Stamina | Defense | Speed |")
        lines.append("|---|---|---|---|---|---|")
        lines.append(f"| v1 avg | {v1_avg[0]} | {v1_avg[1]} | {v1_avg[2]} | {v1_avg[3]} | {v1_avg[4]} |")
        lines.append(f"| v2 avg | {v2_avg[0]} | {v2_avg[1]} | {v2_avg[2]} | {v2_avg[3]} | {v2_avg[4]} |")
        lines.append("")

    # ------------------------------------------------------------------
    # Notable examples
    # ------------------------------------------------------------------
    lines += ["---", "", "## 3. Notable Fighter 비교", ""]
    lines += [
        "| 파이터 | Div | Rank | W-L | v1 stats | v2 stats | avg delta |",
        "|---|---|---|---|---|---|---|",
    ]

    notable_ids_found = {r["id"]: r for r in results if r["id"] in NOTABLE_IDS}
    for fid in [
        "sean-strickland", "ilia-topuria", "islam-makhachev", "khamzat-chimaev",
        "joshua-van", "tom-aspinall", "carlos-ulberg", "petr-yan",
        "alexander-volkanovski", "jon-jones",
    ]:
        r = notable_ids_found.get(fid)
        if not r:
            continue
        rank_str = "C" if r["rank"] == 0 else (str(r["rank"]) if r["rank"] is not None else "—")
        lines.append(
            f"| {r['name']} | {r['division']} | {rank_str} | "
            f"{r['wins']}-{r['losses']} | {_fmt_stats(r['db'])} | "
            f"{_fmt_stats(r['v2'])} | {r['avg_delta']:+.1f} |"
        )

    # Unranked low-sample
    notable_unranked = _find_notable_unranked(results)
    if notable_unranked:
        r = notable_unranked[0]
        lines.append(
            f"| {r['name']} *(low-sample)* | {r['division']} | — | "
            f"{r['wins']}-{r['losses']} | {_fmt_stats(r['db'])} | "
            f"{_fmt_stats(r['v2'])} | {r['avg_delta']:+.1f} |"
        )

    # ------------------------------------------------------------------
    # Top 30 increases / decreases
    # ------------------------------------------------------------------
    lines += [
        "", "---", "",
        "## 4. 가장 큰 변화 Top 30",
        "",
        "### 4-A 가장 많이 오른 파이터 (avg delta 상위 30)",
        "",
        "| 순위 | 파이터 | Div | Rank | W-L | v1 | v2 | avg Δ |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for i, r in enumerate(top_increases, 1):
        rank_str = "C" if r["rank"] == 0 else (str(r["rank"]) if r["rank"] is not None else "—")
        lines.append(
            f"| {i} | {r['name']} | {r['division']} | {rank_str} | "
            f"{r['wins']}-{r['losses']} | {_fmt_stats(r['db'])} | "
            f"{_fmt_stats(r['v2'])} | {r['avg_delta']:+.1f} |"
        )

    lines += [
        "",
        "### 4-B 가장 많이 내린 파이터 (avg delta 하위 30)",
        "",
        "| 순위 | 파이터 | Div | Rank | W-L | v1 | v2 | avg Δ |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for i, r in enumerate(top_decreases, 1):
        rank_str = "C" if r["rank"] == 0 else (str(r["rank"]) if r["rank"] is not None else "—")
        lines.append(
            f"| {i} | {r['name']} | {r['division']} | {rank_str} | "
            f"{r['wins']}-{r['losses']} | {_fmt_stats(r['db'])} | "
            f"{_fmt_stats(r['v2'])} | {r['avg_delta']:+.1f} |"
        )

    # ------------------------------------------------------------------
    # Suspicious outputs
    # ------------------------------------------------------------------
    suspicious = [
        r for r in results
        if r["v2"][0] == 98 or r["v2"][4] == 98  # hitting ceiling
        or any(r["v2"][i] <= 45 and r["rank"] is not None for i in range(5))
        or r["avg_delta"] < -15
    ]

    lines += [
        "", "---", "",
        f"## 5. 의심 출력 ({len(suspicious)}건)",
        "",
        "ceiling(98) 도달 또는 ranked인데 floor(45) 잔존, 또는 평균 -15 이상 감소.",
        "",
        "| 파이터 | Div | Rank | v1 | v2 | avg Δ | 사유 |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in suspicious[:40]:
        reasons = []
        if r["v2"][0] == 98: reasons.append("Striking=98")
        if r["v2"][4] == 98: reasons.append("Speed=98")
        if any(r["v2"][i] <= 45 and r["rank"] is not None for i in range(5)):
            reasons.append("ranked floor잔존")
        if r["avg_delta"] < -15:
            reasons.append(f"avg Δ={r['avg_delta']}")
        rank_str = "C" if r["rank"] == 0 else (str(r["rank"]) if r["rank"] is not None else "—")
        lines.append(
            f"| {r['name']} | {r['division']} | {rank_str} | "
            f"{_fmt_stats(r['db'])} | {_fmt_stats(r['v2'])} | "
            f"{r['avg_delta']:+.1f} | {', '.join(reasons)} |"
        )

    # ------------------------------------------------------------------
    # Grappling floor analysis
    # ------------------------------------------------------------------
    g_floor_v1 = sum(1 for r in results if r["db"][1] == 45)
    g_floor_v2 = sum(1 for r in results if r["v2"][1] <= 47)
    lines += [
        "", "---", "",
        "## 6. Grappling Floor 개선 분석",
        "",
        f"| 항목 | v1 | v2 | 개선 |",
        f"|---|---|---|---|",
        f"| Grappling floor=45 수 | {g_floor_v1} ({round(g_floor_v1/total*100,1)}%) | "
        f"{g_floor_v2} ({round(g_floor_v2/total*100,1)}%) | "
        f"{g_floor_v1 - g_floor_v2:+d} |",
        "",
        "주요 원인: td_avg baseline p95 4.5 → 2.8으로 조정.",
        "v2에서 td_avg > 0인 파이터 대부분이 floor를 탈출하여 개성 있는 grappling 점수를 보임.",
    ]

    lines += [
        "", "---", "",
        "## 7. 운영 반영 금지 확인",
        "",
        "이 리포트는 비교 목적의 dry-run입니다. 아래 항목은 이 스크립트에서 **절대 실행되지 않음:**",
        "",
        "- `fighters.stats[]` UPDATE",
        "- `admin_recompute_fighter_stats(false)` 호출",
        "- Supabase PATCH / POST / DELETE 요청",
        "- Migration 생성",
        "",
        "실제 운영 반영은 `docs/FIGHTER_STATS_SCORING_V2_PLAN.md` 절차에 따라 별도 승인 후 진행.",
    ]

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fighter stats v2 dry-run (read-only)"
    )
    parser.add_argument(
        "--out", default="",
        help="Output file path (default: reports/v2_dry_run_YYYYMMDD.md)"
    )
    parser.add_argument(
        "--notable-only", action="store_true",
        help="Print only notable fighter comparison to stdout, skip full report"
    )
    args = parser.parse_args()

    global _SUPABASE_URL, _API_KEY
    _SUPABASE_URL, _API_KEY = _get_credentials()

    fighters = load_fighters()
    if not fighters:
        print("ERROR: fighters table returned 0 rows.", file=sys.stderr)
        sys.exit(1)

    print("[compute] v1 + v2 for all fighters ...", end=" ", flush=True)
    results = compare(fighters)
    print("done")

    run_ts = datetime.now(timezone.utc)

    if args.notable_only:
        print("\nNotable fighter comparison:")
        print(f"{'파이터':<28} {'Rank':>5}  {'v1':>22}  {'v2':>22}  {'avgΔ':>5}")
        print("-" * 90)
        for fid in [
            "sean-strickland", "ilia-topuria", "islam-makhachev", "khamzat-chimaev",
            "joshua-van", "tom-aspinall", "carlos-ulberg", "jon-jones",
        ]:
            r = next((x for x in results if x["id"] == fid), None)
            if not r:
                continue
            rank_str = "C" if r["rank"] == 0 else (str(r["rank"]) if r["rank"] is not None else "—")
            print(
                f"  {r['name']:<26} {rank_str:>5}  "
                f"{_fmt_stats(r['db']):>22}  {_fmt_stats(r['v2']):>22}  "
                f"{r['avg_delta']:>+5.1f}"
            )
        return

    report = generate_report(results, run_ts)

    out_path = args.out
    if not out_path:
        ts_str = run_ts.strftime("%Y%m%d_%H%M")
        out_path = f"reports/v2_dry_run_{ts_str}.md"

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(report, encoding="utf-8")
    print(f"[report] written → {out_path}")
    print(f"[report] {len(results)} fighters analyzed")

    # Quick console summary
    total = len(results)
    avg_deltas = [
        round(sum(r["delta"][i] for r in results) / total, 1)
        for i in range(5)
    ]
    print(f"\nAvg delta by stat (v2 - v1):")
    for i, name in enumerate(STAT_NAMES):
        print(f"  {name:<12} {avg_deltas[i]:+.1f}")


if __name__ == "__main__":
    main()
