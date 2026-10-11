"""回执码生成：去除易混淆字符的 8 位随机码，格式 GDUECA-XXXXXXXX。"""
import secrets

# 去除 0/O、1/I/L 等易混淆字符
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def gen_receipt_code() -> str:
    return "GDUECA-" + "".join(secrets.choice(_ALPHABET) for _ in range(8))
