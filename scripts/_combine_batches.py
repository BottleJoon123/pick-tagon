"""각 5개 JSONB 배치를 하나의 SQL 파일로 묶어 _superbatch 디렉터리에 저장"""
import os, json

BASE    = os.path.join(os.path.dirname(__file__), "..")
IN_DIR  = os.path.join(BASE, "data", "_jsonbatches")
OUT_DIR = os.path.join(BASE, "data", "_superbatches")
GROUP   = 5

os.makedirs(OUT_DIR, exist_ok=True)
for f in os.listdir(OUT_DIR):
    os.remove(os.path.join(OUT_DIR, f))

files = sorted(f for f in os.listdir(IN_DIR) if f.endswith(".sql"))
# skip batch_000 (already executed)
files = files[1:]   # 001..044

groups = []
for i in range(0, len(files), GROUP):
    groups.append(files[i:i + GROUP])

for gi, grp in enumerate(groups):
    sqls = []
    for fname in grp:
        sql = open(os.path.join(IN_DIR, fname), encoding="utf-8").read().strip()
        sqls.append(sql)
    combined = "\n".join(sqls)
    out = os.path.join(OUT_DIR, f"super_{gi:02d}.sql")
    with open(out, "w", encoding="utf-8") as f:
        f.write(combined)

print(f"Generated {len(groups)} superbatch files (each ~{GROUP} calls)")
for gi, grp in enumerate(groups):
    print(f"  super_{gi:02d}: {', '.join(grp)}")
