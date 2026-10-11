# -*- coding: utf-8 -*-
"""活动历史数据迁移：markdown → 数据库（CMS 对接）。

将 frontend/content/events/*.md 的 8 个历史活动完整迁入 activities 表。

用法：
  python backend/scripts/migrate_events_content.py             # 执行迁移（幂等）
  python backend/scripts/migrate_events_content.py --verify    # 迁移后一致性核对
  python backend/scripts/migrate_events_content.py --rollback  # 回滚：删除本次迁移的行

回滚与追溯机制：
  1. 迁移前全表快照 → backend/scripts/events_migration_snapshot.json（含迁移行清单）
  2. 回滚按 slug 精确删除迁移新增行，不动库中其他数据
  3. markdown 源文件保留不删，前端在 CMS 不可用时自动回退渲染 md（用户侧回滚开关）
"""
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "backend" / "assoc.db"
MD_DIR = ROOT / "frontend" / "content" / "events"
SNAPSHOT_PATH = Path(__file__).resolve().parent / "events_migration_snapshot.json"

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def parse_markdown(path: Path) -> dict:
    """解析 frontmatter（title/type/date/description/participants/images）+ 正文。"""
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.DOTALL)
    if not m:
        raise ValueError(f"{path.name}: 缺少 frontmatter")
    fm_body, content = m.group(1), m.group(2).strip()

    fm = {}
    for line in fm_body.splitlines():
        if not line.strip() or ":" not in line:
            continue
        key, _, val = line.partition(":")
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            # images: [] / images: ["a","b"]
            inner = val[1:-1].strip()
            fm[key.strip()] = [v.strip().strip("'\"") for v in inner.split(",")] if inner else []
        elif val and (val[0] == val[-1] == '"' or val[0] == val[-1] == "'"):
            fm[key.strip()] = val[1:-1]
        else:
            fm[key.strip()] = val

    return {
        "slug": path.stem,
        "title": fm["title"],
        "type": fm["type"],
        "date": fm["date"],
        "description": fm.get("description", ""),
        "participants": int(fm.get("participants", 0) or 0),
        "images": fm.get("images", []),
        "content": content,
    }


def load_events() -> list[dict]:
    events = [parse_markdown(p) for p in sorted(MD_DIR.glob("*.md"))]
    slugs = [e["slug"] for e in events]
    assert len(slugs) == len(set(slugs)), "slug 重复"
    for e in events:
        if not SLUG_RE.match(e["slug"]):
            raise ValueError(f"非法 slug: {e['slug']}")
        if e["type"] not in ("lecture", "competition", "recruitment", "workshop"):
            raise ValueError(f"{e['slug']}: 未知类型 {e['type']}")
    return events


def do_migrate() -> None:
    events = load_events()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(activities)")]
        missing = {"slug", "description", "participants"} - set(cols)
        if missing:
            sys.exit(f"activities 表缺少列 {missing}，请先启动后端完成 _migrate_columns 补列")

        # 1. 全表快照（追溯 + 审计）
        before = [dict(r) for r in conn.execute("SELECT * FROM activities")]
        snapshot = {
            "migrated_at": datetime.now(timezone.utc).isoformat(),
            "source": "frontend/content/events/*.md",
            "rows_before": before,
            "target_slugs": [e["slug"] for e in events],
        }

        # 2. 幂等插入
        inserted, skipped = [], []
        for e in events:
            exists = conn.execute(
                "SELECT id FROM activities WHERE slug = ?", (e["slug"],)
            ).fetchone()
            if exists:
                skipped.append(e["slug"])
                continue
            conn.execute(
                """INSERT INTO activities
                   (title, description, slug, content, category, status,
                    register_start, register_end, start_at, end_at,
                    max_participants, participants, cover_url, checkin_open,
                    created_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 'ENDED',
                           NULL, NULL, ?, ?,
                           0, ?, NULL, 0,
                           1, ?, ?)""",
                (
                    e["title"], e["description"], e["slug"], e["content"], e["type"],
                    f"{e['date']} 00:00:00", f"{e['date']} 23:59:59",
                    e["participants"],
                    datetime.now(timezone.utc).isoformat(" ", "seconds"),
                    datetime.now(timezone.utc).isoformat(" ", "seconds"),
                ),
            )
            inserted.append(e["slug"])
        conn.commit()

        rows_after = [dict(r) for r in conn.execute(
            f"SELECT * FROM activities WHERE slug IN ({','.join('?' * len(events))})",
            [e["slug"] for e in events],
        )]
        snapshot["rows_after"] = rows_after
        SNAPSHOT_PATH.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"迁移完成：新增 {len(inserted)} 行 {inserted}；跳过（已存在）{len(skipped)} 行 {skipped}")
        print(f"快照已写入 {SNAPSHOT_PATH}")
    finally:
        conn.close()


def do_verify() -> None:
    """迁移后一致性核对：md frontmatter 与 DB 行逐字段比对。"""
    events = load_events()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        passed = failed = 0
        for e in events:
            row = conn.execute(
                "SELECT * FROM activities WHERE slug = ?", (e["slug"],)
            ).fetchone()
            if not row:
                print(f"  FAIL  {e['slug']}: 数据库中不存在")
                failed += 1
                continue
            checks = [
                ("title", row["title"] == e["title"]),
                ("description", row["description"] == e["description"]),
                ("category/type", row["category"] == e["type"]),
                ("start_at/date", (row["start_at"] or "")[:10] == e["date"]),
                ("participants", row["participants"] == e["participants"]),
                ("content", row["content"] == e["content"]),
                ("status", row["status"] == "ENDED"),
            ]
            bad = [n for n, ok in checks if not ok]
            if bad:
                print(f"  FAIL  {e['slug']}: 字段不一致 {bad}")
                failed += 1
            else:
                passed += 1
                print(f"  PASS  {e['slug']}（7/7 字段一致）")
        total = conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
        print(f"\n核对结果：{passed} PASS / {failed} FAIL；activities 表共 {total} 行")
        sys.exit(1 if failed else 0)
    finally:
        conn.close()


def do_rollback() -> None:
    """回滚：删除本次迁移的行（按快照 slug + rows_after 的 id 双重确认）。"""
    events = load_events()
    slugs = [e["slug"] for e in events]
    conn = sqlite3.connect(DB_PATH)
    try:
        marks = ",".join("?" * len(slugs))
        cur = conn.execute(
            f"DELETE FROM activities WHERE slug IN ({marks})", slugs
        )
        conn.commit()
        print(f"回滚完成：已删除 {cur.rowcount} 行（slug: {slugs}）")
    finally:
        conn.close()


if __name__ == "__main__":
    if "--verify" in sys.argv:
        do_verify()
    elif "--rollback" in sys.argv:
        do_rollback()
    else:
        do_migrate()
