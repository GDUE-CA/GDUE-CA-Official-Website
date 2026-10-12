"""Break-Glass 应急账号凭据生成脚本（部署侧工具，后端启动路径绝不调用）。

用法（在 backend/ 目录执行）：
    python scripts/generate_super_admin.py
    python scripts/generate_super_admin.py --username bg_ops_admin

输出一段可直接粘贴到 .env / 环境变量管理工具的 SUPER_ADMIN_* 配置片段。
明文密码只在本次 stdout 打印一次，脚本不写任何文件、不访问数据库；
后端全程不生成账号密码，也不打印明文/哈希到日志。

生成后务必：
1. 立即把明文密码存入团队密码管理器；
2. 将 env 片段写入服务器环境（或 .env）；
3. 重启后端服务生效（详见 docs/BREAK_GLASS_OPS.md）。
"""
from __future__ import annotations

import argparse
import re
import secrets
import string
import sys
from pathlib import Path

# 允许在密码中使用的特殊符号（与 Break-Glass 专用强密码策略保持一致）
SPECIALS = "!@#$%^&*()-_=+[]{};:,."

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.password_policy import check_break_glass_password  # noqa: E402
from app.core.security import hash_password  # noqa: E402


def generate_username() -> str:
    return f"bg_admin_{secrets.token_hex(3)}"


def generate_password() -> str:
    """生成满足 Break-Glass 专用强密码策略的随机口令（>=16 位，四类字符齐全）。"""
    while True:
        parts = [
            "".join(secrets.choice(string.ascii_uppercase) for _ in range(4)),
            "".join(secrets.choice(string.ascii_lowercase) for _ in range(5)),
            "".join(secrets.choice(string.digits) for _ in range(4)),
            "".join(secrets.choice(SPECIALS) for _ in range(3)),
        ]
        # 洗牌后拼接，避免各类字符位置固定
        chars = list("".join(parts))
        # 用 secrets 交换洗牌
        for i in range(len(chars) - 1, 0, -1):
            j = secrets.randbelow(i + 1)
            chars[i], chars[j] = chars[j], chars[i]
        candidate = "".join(chars)
        if not check_break_glass_password(candidate, None):
            return candidate


def main() -> int:
    parser = argparse.ArgumentParser(description="生成 Break-Glass 应急账号凭据（env 片段）")
    parser.add_argument("--username", default=None, help="自定义用户名（缺省随机生成）")
    args = parser.parse_args()

    username = args.username or generate_username()
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", username):
        print("错误：用户名仅允许 4-64 位字母/数字/下划线/连字符", file=sys.stderr)
        return 1

    password = generate_password()
    reason = check_break_glass_password(password, username)
    if reason:  # 双保险：生成结果必须通过后端同源校验
        print(f"错误：生成的密码未通过强密码校验：{reason}", file=sys.stderr)
        return 1

    password_hash = hash_password(password)

    print("=" * 64)
    print("⚠️  请立即保存，本提示不会再次显示（明文仅出现这一次）")
    print("=" * 64)
    print()
    print("SUPER_ADMIN_USERNAME=" + username)
    print("SUPER_ADMIN_PASSWORD=" + password)
    print("SUPER_ADMIN_PASSWORD_HASH=" + password_hash)
    print("SUPER_ADMIN_ENABLED=true")
    print()
    print("-" * 64)
    print("1. 将上面 4 行写入服务器环境变量（或 backend/.env）")
    print("2. 明文密码存入密码管理器后，从剪贴板/终端历史中清除")
    print("3. 重启后端服务生效；更换凭据同样修改 env 后重启")
    print("4. 运维细节见 docs/BREAK_GLASS_OPS.md")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
