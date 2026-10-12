"""强口令策略（GB/T 22239-2019 身份鉴别：口令具有复杂度要求并定期更换）。

规则：
- 长度 10–64 个字符，且 UTF-8 编码不超过 72 字节（bcrypt 上限）
- 至少包含大写字母、小写字母、数字、特殊字符中的 3 类
- 不得为常见弱口令，不得包含用户名 / 邮箱前缀
- 不得包含 4 个及以上连续重复字符（aaaa）或连续序列（1234 / abcd / qwer）
"""
import re

MIN_LENGTH = 10
MAX_LENGTH = 64
BCRYPT_MAX_BYTES = 72

# 常见弱口令（小写比较）；可按需补充
_COMMON_WEAK = {
    "admin", "admin123", "admin888", "administrator", "root", "root123",
    "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
    "123456", "1234567", "12345678", "123456789", "1234567890", "0123456789",
    "111111", "000000", "888888", "666666", "123123", "abc123", "abcd1234",
    "qwerty", "qwerty123", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "zxcvbnm",
    "iloveyou", "welcome", "welcome1", "letmein", "changeme", "changeme123!",
    "admin@123", "admin@1234", "admin#123", "gdueca", "gdueca123", "gdue123",
}

_SEQUENCES = (
    "0123456789",
    "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
)


def _has_sequence(pw: str, length: int = 4) -> bool:
    lower = pw.lower()
    for seq in _SEQUENCES:
        for s in (seq, seq[::-1]):
            for i in range(len(s) - length + 1):
                if s[i:i + length] in lower:
                    return True
    return False


def check_password_strength(
    password: str,
    username: str | None = None,
    email: str | None = None,
) -> str | None:
    """校验口令强度；通过返回 None，不通过返回中文原因。"""
    if len(password) < MIN_LENGTH:
        return f"密码长度至少 {MIN_LENGTH} 位"
    if len(password) > MAX_LENGTH or len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        return f"密码过长（最多 {MAX_LENGTH} 个字符 / {BCRYPT_MAX_BYTES} 字节）"
    if any(c.isspace() for c in password):
        return "密码不能包含空白字符"

    classes = sum([
        bool(re.search(r"[A-Z]", password)),
        bool(re.search(r"[a-z]", password)),
        bool(re.search(r"\d", password)),
        bool(re.search(r"[^A-Za-z0-9]", password)),
    ])
    if classes < 3:
        return "密码需至少包含大写字母、小写字母、数字、特殊字符中的 3 类"

    lower = password.lower()
    if lower in _COMMON_WEAK:
        return "密码过于常见，请更换"
    if re.search(r"(.)\1{3,}", password):
        return "密码不能包含 4 个及以上连续重复字符"
    if _has_sequence(password):
        return "密码不能包含 4 位及以上连续序列（如 1234、abcd、qwer）"

    for ident in (username, (email or "").split("@")[0]):
        if ident and len(ident) >= 3 and ident.lower() in lower:
            return "密码不能包含用户名或邮箱前缀"
    return None


def validate_password_strength(
    password: str,
    username: str | None = None,
    email: str | None = None,
) -> None:
    """校验失败抛 ValueError（供 Pydantic validator / 业务层使用）。"""
    reason = check_password_strength(password, username, email)
    if reason:
        raise ValueError(reason)


# ---------- Break-Glass 应急账号专用强密码策略（严苛于普通账号） ----------
BG_MIN_LENGTH = 12
BG_MAX_LENGTH = 64
# 需求硬性规定允许的特殊符号集合；超出此集合的非字母数字字符一律拒绝
_BG_SPECIAL_SET = set("!@#$%^&*()-_=+[]{};:,.?")

# Break-Glass 弱密码黑名单（继承普通黑名单 + 应急账号高危口令）
_BG_COMMON_WEAK = _COMMON_WEAK | {
    "superadmin", "superadmin123", "breakglass", "breakglass123",
    "emergency", "emergency123", "adminadmin", "rootroot",
    "supersecret", "initial_admin", "firstadmin", "masteradmin",
}


def check_break_glass_password(password: str, username: str | None = None) -> str | None:
    """Break-Glass 应急账号专用强密码校验（严苛于普通账号策略）。

    规则（需求硬性规定）：
    1. 长度 ≥ 12 字符，UTF-8 ≤ 72 字节（bcrypt 上限）
    2. 不含空白字符
    3. 四类字符中至少包含三类：大写 A-Z、小写 a-z、数字 0-9、
       允许特殊符号 !@#$%^&*()-_=+[]{};:,.?
       （密码中出现的非字母数字字符必须全部属于允许的特殊符号集合）
    4. 密码不等于登录用户名
    5. 不在弱密码黑名单中
    6. 不含 4 个及以上连续重复字符或连续序列

    通过返回 None，不通过返回中文原因。
    """
    if len(password) < BG_MIN_LENGTH:
        return f"应急账号密码长度至少 {BG_MIN_LENGTH} 位"
    if len(password) > BG_MAX_LENGTH or len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        return f"密码过长（最多 {BG_MAX_LENGTH} 个字符 / {BCRYPT_MAX_BYTES} 字节）"
    if any(c.isspace() for c in password):
        return "密码不能包含空白字符"

    # 非字母数字字符必须全部属于允许的特殊符号集合
    non_alnum = {c for c in password if not c.isalnum()}
    disallowed = non_alnum - _BG_SPECIAL_SET
    if disallowed:
        return "密码含不允许的特殊字符（仅允许 !@#$%^&*()-_=+[]{};:,.?）"

    has_upper = bool(re.search(r"[A-Z]", password))
    has_lower = bool(re.search(r"[a-z]", password))
    has_digit = bool(re.search(r"\d", password))
    has_special = bool(non_alnum & _BG_SPECIAL_SET)
    classes = sum([has_upper, has_lower, has_digit, has_special])
    if classes < 3:
        return "密码需至少包含大写字母、小写字母、数字、特殊字符中的 3 类"

    lower = password.lower()
    if lower in _BG_COMMON_WEAK:
        return "密码过于常见，请更换"
    if re.search(r"(.)\1{3,}", password):
        return "密码不能包含 4 个及以上连续重复字符"
    if _has_sequence(password):
        return "密码不能包含 4 位及以上连续序列（如 1234、abcd、qwer）"

    if username and password == username:
        return "密码不能与登录用户名相同"
    return None
