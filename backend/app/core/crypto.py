"""对称加密工具：第三方登录渠道的 client_secret 落库加密。

密钥从 JWT_SECRET_KEY 派生（sha256 → Fernet 32 字节 key），
应用密文（Fernet 自带时间戳 + HMAC），库中不存明文；
接口输出一律脱敏，仅在发起 OAuth 授权流程时解密使用。
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def _fernet() -> Fernet:
    secret = get_settings().JWT_SECRET_KEY.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt_secret(plain: str) -> str:
    """加密 client_secret（UTF-8 文本，可为 Apple 的 JWT 私钥）。"""
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(cipher: str | None) -> str | None:
    """解密 client_secret；密文损坏或密钥轮换后解不开时返回 None（需重新配置）。"""
    if not cipher:
        return None
    try:
        return _fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def mask_secret(secret: str) -> str:
    """脱敏展示：保留前 4 后 2，其余以 *** 代替。"""
    if len(secret) <= 8:
        return "***"
    return f"{secret[:4]}***{secret[-2:]}"
