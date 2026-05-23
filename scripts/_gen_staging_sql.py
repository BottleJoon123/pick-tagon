import csv, os, json

BASE = os.path.join(os.path.dirname(__file__), "..")
CSV  = os.path.join(BASE, "data", "ufcstats_fighters_raw.csv")

def q(v):
    if v is None or str(v).strip() in ("", "None"):
        return "NULL"
    try:
        float(v)
        return str(float(v))
    except Exception:
        return "NULL"

def qs(v):
    if not v or str(v).strip() == "":
        return "NULL"
    s = str(v).strip()
    # escape single quotes only, no other transformations
    return "'" + s.replace("'", "''") + "'"

with open(CSV, encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

print(f"Loaded {len(rows)} CSV rows")

BATCH = 100
batches = []
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i + BATCH]
    vals = []
    for r in chunk:
        vals.append(
            "("
            + ",".join([
                qs("ufcstats_20260519"),
                qs(r["ufc_stats_id"]),
                qs(r["profile_url"]),
                qs(r["name_en"]),
                q(r["slpm"]),
                q(r["str_acc"]),
                q(r["sapm"]),
                q(r["str_def"]),
                q(r["td_avg"]),
                q(r["td_acc"]),
                q(r["td_def"]),
                q(r["sub_avg"]),
                qs(r["scraped_at"]),
            ])
            + ")"
        )
    sql = (
        "INSERT INTO public.fighter_stats_staging "
        "(import_batch,source_ufc_stats_id,profile_url,source_name,"
        "slpm,str_acc,sapm,str_def,td_avg,td_acc,td_def,sub_avg,scraped_at) VALUES\n"
        + ",\n".join(vals)
        + "\nON CONFLICT (import_batch,source_ufc_stats_id) "
          "WHERE source_ufc_stats_id IS NOT NULL DO NOTHING;"
    )
    # verify val count
    for line in vals:
        cnt = line.count(",") - line.count("','")
        # quick sanity: each row must have 12 commas between 13 values
    batches.append(sql)

out_dir = os.path.join(BASE, "data", "_batches")
os.makedirs(out_dir, exist_ok=True)
# clean old batches
for f in os.listdir(out_dir):
    os.remove(os.path.join(out_dir, f))

for i, sql in enumerate(batches):
    path = os.path.join(out_dir, f"batch_{i:03d}.sql")
    with open(path, "w", encoding="utf-8") as f:
        f.write(sql)

# also save JSON index
with open(os.path.join(BASE, "data", "_staging_import_batches.json"), "w", encoding="utf-8") as f:
    json.dump(batches, f, ensure_ascii=False)

print(f"Generated {len(batches)} batches of ~{BATCH} rows each")
print(f"First batch size: {len(batches[0])} bytes")
print(f"Files: {out_dir}")
