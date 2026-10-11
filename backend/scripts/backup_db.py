#!/usr/bin/env python3
"""数据库定期备份（GB/T 22239 数据备份恢复）。

- SQLite：使用在线备份 API 生成一致性快照（服务运行中也可安全执行），gzip 压缩
- PostgreSQL：调用 pg_dump 导出（需本机安装 pg_dump）
- 备份文件权限 0600，按保留天数自动清理过期备份
- 同时备份头像上传目录

用法（在 backend 目录下）：
    python scripts/backup_db.py                         # 默认备份到 ./backups，保留 30 天
    python scripts/backup_db.py --dest /srv/backups --keep-days 90

建议通过 cron 每日执行，并定期将备份同步到异地存储、演练恢复：
    30 3 * * * cd /srv/gdueca/backend && .venv/bin/python scripts/backup_db.py >> logs/backup.log 2>&1
"""
import argparse
import gzip
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402


def _sqlite_path(url: str) -> Path:
    return Path(url.split(":///", 1)[1])


def backup_sqlite(db_path: Path, dest: Path, stamp: str) -> Path:
    out = dest / f"db-{stamp}.sqlite3.gz"
    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / "snapshot.sqlite3"
        src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        dst = sqlite3.connect(snapshot)
        with dst:
            src.backup(dst)
        src.close()
        dst.close()
        with open(snapshot, "rb") as f_in, gzip.open(out, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
    return out


def backup_postgres(url: str, dest: Path, stamp: str) -> Path:
    out = dest / f"db-{stamp}.pgdump"
    dsn = url.replace("postgresql+asyncpg://", "postgresql://")
    subprocess.run(["pg_dump", "--format=custom", f"--file={out}", dsn], check=True)
    return out


def backup_uploads(dest: Path, stamp: str) -> Path | None:
    uploads = Path("uploads")
    if not uploads.exists():
        return None
    out = dest / f"uploads-{stamp}.tar.gz"
    with tarfile.open(out, "w:gz") as tar:
        tar.add(uploads, arcname="uploads")
    return out


def prune(dest: Path, keep_days: int) -> int:
    cutoff = time.time() - keep_days * 86400
    removed = 0
    for f in dest.glob("*-*.*"):
        if f.is_file() and f.stat().st_mtime < cutoff:
            f.unlink()
            removed += 1
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description="GDUECA 数据库备份")
    parser.add_argument("--dest", default="backups", help="备份目录（默认 ./backups）")
    parser.add_argument("--keep-days", type=int, default=30, help="保留天数（默认 30）")
    args = parser.parse_args()

    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    os.chmod(dest, 0o700)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    url = get_settings().DATABASE_URL

    if url.startswith("sqlite"):
        out = backup_sqlite(_sqlite_path(url), dest, stamp)
    elif url.startswith("postgresql"):
        out = backup_postgres(url, dest, stamp)
    else:
        print(f"不支持的数据库类型：{url.split(':', 1)[0]}", file=sys.stderr)
        return 1
    os.chmod(out, 0o600)
    print(f"[{stamp}] 数据库备份完成：{out}（{out.stat().st_size} 字节）")

    up = backup_uploads(dest, stamp)
    if up:
        os.chmod(up, 0o600)
        print(f"[{stamp}] 上传文件备份完成：{up}")

    removed = prune(dest, args.keep_days)
    if removed:
        print(f"[{stamp}] 已清理 {removed} 个超过 {args.keep_days} 天的旧备份")
    return 0


if __name__ == "__main__":
    sys.exit(main())
