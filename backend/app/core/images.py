"""图片上传公共处理：魔数嗅验 + 80% 质量压缩（P0 统一图片上传约束）。

- sniff_image_ext：按文件头魔数识别 JPG/PNG/WEBP，不信任客户端 Content-Type（防伪装上传）；
- compress_image：JPEG / WEBP 以 quality=80 重编码（工程意义上的「80% 无损体积压缩」），
  最长边超过 MAX_DIM 时等比缩放；PNG 为无损格式，仅做 optimize 重编码；
  压缩结果反而变大时回退原始字节。所有处理纯内存完成，不落盘临时文件。
"""
from __future__ import annotations

from io import BytesIO

QUALITY = 80          # 重编码质量（80% 压缩）
MAX_DIM = 2048        # 最长边上限（超限等比缩放，防巨型图片内存放大）

_EXT_TO_FORMAT = {".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP", ".png": "PNG"}


def sniff_image_ext(data: bytes) -> str | None:
    """按魔数识别图片类型，返回规范扩展名；无法识别返回 None。"""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def compress_image(data: bytes, ext: str) -> tuple[bytes, str]:
    """压缩图片字节，返回 (压缩后字节, 最终扩展名)。

    无法解码（理论上魔数嗅验已拦截伪装文件）时原样返回，不阻塞上传。
    """
    try:
        from PIL import Image
        img = Image.open(BytesIO(data))
        img.load()
    except Exception:
        return data, ext

    fmt = _EXT_TO_FORMAT.get(ext)
    if fmt is None:
        return data, ext

    # 超限缩放（LANCZOS 高质量降采样）
    w, h = img.size
    if max(w, h) > MAX_DIM:
        ratio = MAX_DIM / float(max(w, h))
        img = img.resize((max(1, int(w * ratio)), max(1, int(h * ratio))), Image.LANCZOS)

    buf = BytesIO()
    if fmt == "PNG":
        # PNG 无损：保留 alpha，仅 optimize；保存扩展名不变
        if img.mode not in ("RGBA", "RGB", "L"):
            img = img.convert("RGBA")
        img.save(buf, "PNG", optimize=True)
        out_ext = ".png"
    else:
        # JPEG 不支持 alpha：透明通道合成白底
        if fmt == "JPEG":
            if img.mode in ("RGBA", "LA", "P"):
                rgba = img.convert("RGBA")
                background = Image.new("RGB", rgba.size, (255, 255, 255))
                background.paste(rgba, mask=rgba.split()[-1])
                img = background
            elif img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
        img.save(buf, fmt, quality=QUALITY, optimize=True)
        out_ext = ext

    out = buf.getvalue()
    # 压缩反而变大（如已高度优化的小图）时回退原始字节
    if len(out) >= len(data):
        return data, ext
    return out, out_ext
