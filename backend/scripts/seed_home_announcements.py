# -*- coding: utf-8 -*-
"""主页公告同步：首页「最新公告」栏目内置内容 → announcements 表（category=HOME）。

将首页公告栏当前展示的 3 条公告迁入后台 CMS，之后可在后台「主页公告」页面管理。

用法：
  python backend/scripts/seed_home_announcements.py             # 执行同步（幂等，按标题去重）
  python backend/scripts/seed_home_announcements.py --verify    # 同步后一致性核对
  python backend/scripts/seed_home_announcements.py --rollback  # 回滚：删除本次同步的行

追溯与回滚机制：
  1. 同步前快照 → backend/scripts/home_announcements_seed_snapshot.json
  2. 回滚按 category=HOME + 标题精确删除本次同步行，不动库中其他数据
  3. 前端 i18n 内置公告保留不删，后端不可用时首页自动回退渲染（用户侧回滚开关）
"""
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "backend" / "assoc.db"
SNAPSHOT_PATH = Path(__file__).resolve().parent / "home_announcements_seed_snapshot.json"

# 首页「最新公告」栏目当前展示的 3 条公告（与 i18n home.announcements item1-3 一致）
# date = 公告日期（写入 start_at 当日 00:00 UTC，前端展示日期部分）
SEED_ITEMS = [
    {
        "date": "2026-09-18",
        "title": "会员大会换届：陈忆佳当选执行会长",
    },
    {
        "date": "2026-04-25",
        "title": "计算机知识科普竞赛“‘技’启新知，‘计’筑梦想”",
    },
    {
        "date": "2025-10-01",
        "title": "百团大绽招新：扫码入群，现场答题拿奖",
    },
]


def load_existing_titles(conn: sqlite3.Connection) -> set:
    rows = conn.execute(
        "SELECT title FROM announcements WHERE category='HOME'"
    ).fetchall()
    return {r[0] for r in rows}


def snapshot(conn: sqlite3.Connection) -> list:
    rows = conn.execute(
        "SELECT id, category, title, content, link, start_at, end_at, enabled,"
        " priority, created_by, created_at FROM announcements"
    ).fetchall()
    return [
        {
            "id": r[0], "category": r[1], "title": r[2], "content": r[3],
            "link": r[4], "start_at": r[5], "end_at": r[6], "enabled": r[7],
            "priority": r[8], "created_by": r[9], "created_at": r[10],
        }
        for r in rows
    ]


def do_seed() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        existing = load_existing_titles(conn)
        todo = [it for it in SEED_ITEMS if it["title"] not in existing]
        snap = snapshot(conn)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        for it in todo:
            conn.execute(
                "INSERT INTO announcements"
                " (category, title, content, link, start_at, end_at, enabled,"
                "  priority, created_by, created_at)"
                " VALUES ('HOME', ?, ?, NULL, ?, NULL, 1, 0, 1, ?)",
                (it["title"], it["title"], f"{it['date']} 00:00:00", now),
            )
        conn.commit()
        SNAPSHOT_PATH.write_text(
            json.dumps(
                {
                    "seeded_at": now,
                    "target_titles": [it["title"] for it in SEED_ITEMS],
                    "rows_before": len(snap),
                    "rows_after": len(snapshot(conn)),
                    "snapshot_before": snap,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"[seed] 新插入 {len(todo)} 条，跳过已存在 {len(SEED_ITEMS) - len(todo)} 条")
        print(f"[seed] 快照已写入 {SNAPSHOT_PATH.name}")
    finally:
        conn.close()


def do_verify() -> bool:
    """核对：3 条公告全部入库、字段值正确、按 start_at 倒序排列正确。"""
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            "SELECT title, content, category, start_at, end_at, enabled, priority, link"
            " FROM announcements WHERE category='HOME'"
            " ORDER BY start_at DESC, created_at DESC"
        ).fetchall()
    finally:
        conn.close()

    ok = True
    got = {r[0] for r in rows}
    for it in SEED_ITEMS:
        if it["title"] not in got:
            print(f"[verify][FAIL] 缺失公告：{it['title']}")
            ok = False

    by_title = {r[0]: r for r in rows}
    for it in SEED_ITEMS:
        r = by_title.get(it["title"])
        if not r:
            continue
        title, content, category, start_at, end_at, enabled, priority, link = r
        checks = [
            (content == it["title"], f"content={content!r}"),
            (category == "HOME", f"category={category!r}"),
            (start_at == f"{it['date']} 00:00:00", f"start_at={start_at!r}"),
            (end_at is None, f"end_at={end_at!r}"),
            (enabled == 1, f"enabled={enabled!r}"),
            (priority == 0, f"priority={priority!r}"),
            (link is None, f"link={link!r}"),
        ]
        for passed, detail in checks:
            if not passed:
                print(f"[verify][FAIL] {it['title']}: {detail}")
                ok = False

    # 排序核对：按 start_at 倒序应为 2026-09-18 → 2026-04-25 → 2025-10-01
    dates = [r[3][:10] for r in rows]
    expect = sorted((it["date"] for it in SEED_ITEMS), reverse=True)
    if dates != expect:
        print(f"[verify][FAIL] 排序错误：{dates} != {expect}")
        ok = False

    print("[verify] PASS：3 条公告入库且字段一致，start_at 倒序正确" if ok else "[verify] 存在不一致项")
    return ok


def do_rollback() -> None:
    titles = [it["title"] for it in SEED_ITEMS]
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute(
            f"DELETE FROM announcements WHERE category='HOME' AND title IN ({','.join('?' * len(titles))})",
            titles,
        )
        conn.commit()
        print(f"[rollback] 已删除 {cur.rowcount} 条本次同步的公告")
    finally:
        conn.close()


if __name__ == "__main__":
    if "--rollback" in sys.argv:
        do_rollback()
    elif "--verify" in sys.argv:
        sys.exit(0 if do_verify() else 1)
    else:
        do_seed()
        sys.exit(0 if do_verify() else 1)
