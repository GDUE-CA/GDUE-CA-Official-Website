# -*- coding: utf-8 -*-
"""博客 + 项目展示内容迁移：markdown → 数据库（CMS 对接）。

将 frontend/content/blog/*.md（3 篇）迁入 blog_posts / blog_tags / blog_post_tags，
frontend/content/projects/*.md（4 个）迁入 projects 表（需先启动后端建表）。

用法：
  python backend/scripts/seed_blog_projects_content.py             # 执行迁移（幂等，按 slug 去重）
  python backend/scripts/seed_blog_projects_content.py --verify    # 迁移后一致性核对
  python backend/scripts/seed_blog_projects_content.py --rollback  # 回滚：删除本次迁移的行

回滚与追溯机制：
  1. 迁移前快照 → backend/scripts/blog_projects_seed_snapshot.json
  2. 回滚按 slug 精确删除（博客含关联 blog_post_tags；仅删除本次未绑定过
     其他文章的标签），不动库中其他数据
  3. markdown 源文件由调用方决定是否保留（本脚本不删源文件）
"""
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "backend" / "assoc.db"
BLOG_DIR = ROOT / "frontend" / "content" / "blog"
PROJECT_DIR = ROOT / "frontend" / "content" / "projects"
SNAPSHOT_PATH = Path(__file__).resolve().parent / "blog_projects_seed_snapshot.json"

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def parse_markdown(path: Path) -> dict:
    """解析 frontmatter（标量 + 单行数组 + 多行 `- item` 数组）+ 正文。"""
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.DOTALL)
    if not m:
        raise ValueError(f"{path.name}: 缺少 frontmatter")
    fm_body, content = m.group(1), m.group(2).strip()

    fm: dict = {}
    cur_list_key: str | None = None
    for line in fm_body.splitlines():
        if not line.strip():
            continue
        if cur_list_key and re.match(r"^\s+-\s*", line):
            item = re.sub(r"^\s+-\s*", "", line).strip().strip("'\"")
            fm[cur_list_key].append(item)
            continue
        cur_list_key = None
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            fm[key] = [v.strip().strip("'\"") for v in inner.split(",")] if inner else []
        elif not val:
            fm[key] = []
            cur_list_key = key   # 后续 `- item` 行归入该键
        elif val[0] == val[-1] == '"' or val[0] == val[-1] == "'":
            fm[key] = val[1:-1]
        else:
            fm[key] = val

    return {"slug": path.stem, "fm": fm, "content": content}


def load_blog() -> list[dict]:
    posts = []
    for p in sorted(BLOG_DIR.glob("*.md")):
        parsed = parse_markdown(p)
        fm = parsed["fm"]
        posts.append({
            "slug": parsed["slug"],
            "title": fm["title"],
            "excerpt": fm.get("excerpt", ""),
            "date": fm["date"],
            "tags": fm.get("tags", []),
            "author": fm.get("author", ""),
            "content": parsed["content"],
        })
    slugs = [b["slug"] for b in posts]
    assert len(slugs) == len(set(slugs)), "blog slug 重复"
    for b in posts:
        if not SLUG_RE.match(b["slug"]):
            raise ValueError(f"非法 slug: {b['slug']}")
    return posts


def load_projects() -> list[dict]:
    projects = []
    for p in sorted(PROJECT_DIR.glob("*.md")):
        parsed = parse_markdown(p)
        fm = parsed["fm"]
        projects.append({
            "slug": parsed["slug"],
            "title": fm["title"],
            "description": fm.get("description", ""),
            "tech_stack": fm.get("techStack", []),
            "github_url": fm.get("githubUrl") or None,
            "demo_url": fm.get("demoUrl") or None,
            "screenshots": fm.get("screenshots", []),
            "year": int(fm["year"]),
            "leader": fm.get("leader", ""),
            "content": parsed["content"],
        })
    slugs = [pr["slug"] for pr in projects]
    assert len(slugs) == len(set(slugs)), "project slug 重复"
    for pr in projects:
        if not SLUG_RE.match(pr["slug"]):
            raise ValueError(f"非法 slug: {pr['slug']}")
    return projects


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def do_migrate() -> None:
    blog = load_blog()
    projects = load_projects()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        missing_cols = []
        if "blog_posts" in tables:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(blog_posts)")}
            missing_cols += [c for c in ("author_name",) if c not in cols]
        if {"blog_posts", "blog_tags", "blog_post_tags", "projects"} - tables:
            sys.exit("缺少目标表，请先启动后端完成 create_all 建表")
        if missing_cols:
            sys.exit(f"blog_posts 缺少列 {missing_cols}，请先启动后端完成 _migrate_columns 补列")

        snapshot = {
            "migrated_at": _now(),
            "source": ["frontend/content/blog/*.md", "frontend/content/projects/*.md"],
            "blog_slugs": [b["slug"] for b in blog],
            "project_slugs": [pr["slug"] for pr in projects],
        }

        inserted_blog, inserted_proj, skipped = [], [], []

        # ---------- 博客 ----------
        for b in blog:
            exists = conn.execute(
                "SELECT id FROM blog_posts WHERE slug = ?", (b["slug"],)
            ).fetchone()
            if exists:
                skipped.append(f"blog:{b['slug']}")
                continue
            now = _now()
            cur = conn.execute(
                """INSERT INTO blog_posts
                   (title, slug, author_name, content_md, excerpt, cover_url,
                    status, published_at, scheduled_at, author_id, allow_comments,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, NULL, 'PUBLISHED', ?, NULL, NULL, 1, ?, ?)""",
                (b["title"], b["slug"], b["author"], b["content"], b["excerpt"],
                 f"{b['date']} 00:00:00", now, now),
            )
            post_id = cur.lastrowid
            for tag_name in b["tags"]:
                tag_row = conn.execute(
                    "SELECT id FROM blog_tags WHERE name = ?", (tag_name,)
                ).fetchone()
                if tag_row:
                    tag_id = tag_row["id"]
                else:
                    tag_id = conn.execute(
                        "INSERT INTO blog_tags (name, slug, created_at) VALUES (?, 'pending-slug', ?)",
                        (tag_name, now),
                    ).lastrowid
                    conn.execute(
                        "UPDATE blog_tags SET slug = ? WHERE id = ?", (f"tag-{tag_id}", tag_id)
                    )
                conn.execute(
                    "INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)",
                    (post_id, tag_id),
                )
            inserted_blog.append(b["slug"])

        # ---------- 项目 ----------
        for pr in projects:
            exists = conn.execute(
                "SELECT id FROM projects WHERE slug = ?", (pr["slug"],)
            ).fetchone()
            if exists:
                skipped.append(f"project:{pr['slug']}")
                continue
            now = _now()
            conn.execute(
                """INSERT INTO projects
                   (title, slug, description, tech_stack, github_url, demo_url,
                    screenshots, year, leader, content_md, status,
                    created_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', 1, ?, ?)""",
                (pr["title"], pr["slug"], pr["description"],
                 json.dumps(pr["tech_stack"], ensure_ascii=False),
                 pr["github_url"], pr["demo_url"],
                 json.dumps(pr["screenshots"], ensure_ascii=False),
                 pr["year"], pr["leader"], pr["content"], now, now),
            )
            inserted_proj.append(pr["slug"])

        conn.commit()

        snapshot["inserted_blog"] = inserted_blog
        snapshot["inserted_projects"] = inserted_proj
        snapshot["skipped"] = skipped
        SNAPSHOT_PATH.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[seed] 博客新增 {len(inserted_blog)} {inserted_blog}；项目新增 {len(inserted_proj)} {inserted_proj}")
        print(f"[seed] 跳过（已存在）{len(skipped)} {skipped}")
        print(f"[seed] 快照已写入 {SNAPSHOT_PATH.name}")
    finally:
        conn.close()


def do_verify() -> None:
    """迁移后一致性核对：md frontmatter 与 DB 行逐字段比对。"""
    blog = load_blog()
    projects = load_projects()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        passed = failed = 0
        for b in blog:
            row = conn.execute(
                "SELECT * FROM blog_posts WHERE slug = ?", (b["slug"],)
            ).fetchone()
            if not row:
                print(f"  FAIL  blog:{b['slug']}: 数据库中不存在")
                failed += 1
                continue
            tag_names = [r["name"] for r in conn.execute(
                "SELECT t.name FROM blog_tags t JOIN blog_post_tags pt ON pt.tag_id = t.id"
                " WHERE pt.post_id = ?", (row["id"],),
            )]
            checks = [
                ("title", row["title"] == b["title"]),
                ("excerpt", row["excerpt"] == b["excerpt"]),
                ("author_name", row["author_name"] == b["author"]),
                ("published_at/date", (row["published_at"] or "")[:10] == b["date"]),
                ("tags", sorted(tag_names) == sorted(b["tags"])),
                ("content", row["content_md"] == b["content"]),
                # SAEnum 按枚举名存储（大写）
                ("status", row["status"] == "PUBLISHED"),
            ]
            bad = [n for n, ok in checks if not ok]
            if bad:
                print(f"  FAIL  blog:{b['slug']}: 字段不一致 {bad}")
                failed += 1
            else:
                passed += 1
                print(f"  PASS  blog:{b['slug']}（7/7 字段一致）")

        for pr in projects:
            row = conn.execute(
                "SELECT * FROM projects WHERE slug = ?", (pr["slug"],)
            ).fetchone()
            if not row:
                print(f"  FAIL  project:{pr['slug']}: 数据库中不存在")
                failed += 1
                continue
            checks = [
                ("title", row["title"] == pr["title"]),
                ("description", row["description"] == pr["description"]),
                ("tech_stack", json.loads(row["tech_stack"]) == pr["tech_stack"]),
                ("github_url", row["github_url"] == pr["github_url"]),
                ("demo_url", row["demo_url"] == pr["demo_url"]),
                ("screenshots", json.loads(row["screenshots"]) == pr["screenshots"]),
                ("year", row["year"] == pr["year"]),
                ("leader", row["leader"] == pr["leader"]),
                ("content", row["content_md"] == pr["content"]),
                # SAEnum 按枚举名存储（大写）
                ("status", row["status"] == "PUBLISHED"),
            ]
            bad = [n for n, ok in checks if not ok]
            if bad:
                print(f"  FAIL  project:{pr['slug']}: 字段不一致 {bad}")
                failed += 1
            else:
                passed += 1
                print(f"  PASS  project:{pr['slug']}（10/10 字段一致）")
        print(f"\n核对结果：{passed} PASS / {failed} FAIL")
        sys.exit(1 if failed else 0)
    finally:
        conn.close()


def do_rollback() -> None:
    """回滚：按 slug 删除本次迁移行；标签仅删除未绑定其他文章的孤儿标签。"""
    blog = load_blog()
    projects = load_projects()
    blog_slugs = [b["slug"] for b in blog]
    proj_slugs = [pr["slug"] for pr in projects]
    conn = sqlite3.connect(DB_PATH)
    try:
        # 孤儿标签 = 本次迁移文章使用过、且回滚后不再绑定任何文章的标签
        tag_names = sorted({t for b in blog for t in b["tags"]})
        orphan_marks = ",".join("?" * len(tag_names)) if tag_names else "''"
        conn.execute(
            f"""DELETE FROM blog_tags WHERE name IN ({orphan_marks})
                AND id NOT IN (SELECT tag_id FROM blog_post_tags)""",
            tag_names,
        )
        conn.execute(
            "DELETE FROM blog_posts WHERE slug IS NOT NULL AND slug IN (%s)"
            % ",".join("?" * len(blog_slugs)),
            blog_slugs,
        )
        conn.execute(
            "DELETE FROM projects WHERE slug IN (%s)" % ",".join("?" * len(proj_slugs)),
            proj_slugs,
        )
        conn.commit()
        print(f"[rollback] 已删除博客 {len(blog_slugs)} 篇、项目 {len(proj_slugs)} 个及其孤儿标签")
    finally:
        conn.close()


if __name__ == "__main__":
    if "--verify" in sys.argv:
        do_verify()
    elif "--rollback" in sys.argv:
        do_rollback()
    else:
        do_migrate()
