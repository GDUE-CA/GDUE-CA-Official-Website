"""手动种子 / 修复脚本（V0.6.0 Issue12）。

以 `python -m app.seed` 运行，等价于应用启动时自动执行的 `_init_db()`：
建表（含轻量列迁移）+ 预置系统设置 / 内置主题 / 安全问题题库 / 意向部门选项。
全部步骤幂等（仅在缺省时插入，不覆盖管理员已修改的数据）。

适用场景：
- 灾难恢复：从备份还原数据库后补齐种子数据；
- 部署故障排查：启动逻辑中途失败导致种子缺失时手动补种；
- 新环境初始化演练。

用法（backend 目录下）：
    python -m app.seed
"""
import asyncio
import logging

from app.main import _init_db


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    await _init_db()
    print("[seed] 完成：建表 / 迁移 / 种子数据全部就绪（幂等，可重复执行）。")


if __name__ == "__main__":
    asyncio.run(main())
