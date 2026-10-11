"""数据导出工具：CSV + Excel(.xlsx)。

既保留报名记录专用的 ``registrations_to_csv/xlsx``，又提供通用
``to_csv/to_xlsx`` 供任意列表导出复用（CMS 各模块统一调用）。
公式注入防护 + 文本列强制文本格式，对所有模块一致生效。
"""
from datetime import datetime
from io import BytesIO
from typing import Any, Sequence

from openpyxl import Workbook
from openpyxl.styles import Font

from app.db.models import Registration

HEADERS_CN = [
    ("序号", "index"),
    ("姓名", "name"),
    ("学号", "student_id"),
    ("学院", "college"),
    ("专业", "major"),
    ("区号", "phone_cc"),
    ("手机号", "phone_number"),
    ("邮箱", "email"),
    ("状态", "status"),
    ("备注", "remark"),
    ("提交时间", "submitted_at"),
    ("提交IP", "submit_ip"),
]


# 以这些字符开头的单元格会被 Excel / WPS 当作公式执行（CSV 注入 / 公式注入）
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\uff1d", "\uff0b", "\uff0d", "\uff20")


# 访客自由填写的列（区号 / 手机号 / 学号已由格式校验约束，不做处理以免显示多余引号）
_FREE_TEXT_KEYS = {"name", "college", "major", "email", "remark"}


def _neutralize(s: str) -> str:
    """以公式字符开头时前置单引号，Excel / WPS 按纯文本显示而不执行。"""
    return "'" + s if s.startswith(_FORMULA_PREFIXES) else s


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if hasattr(v, "value"):  # Enum
        return v.value
    return str(v)


def registrations_to_csv(rows: list[Registration]) -> bytes:
    """导出 CSV（UTF-8 BOM + CRLF，Excel 直接打开不乱码）。"""
    # 简单 CSV 实现：字段内逗号/引号/换行转义
    def esc(s: str) -> str:
        if any(c in s for c in [",", '"', "\n", "\r"]):
            return '"' + s.replace('"', '""') + '"'
        return s

    lines = [",".join(h for h, _ in HEADERS_CN)]
    for i, r in enumerate(rows, 1):
        row = [str(i)]
        for _, key in HEADERS_CN[1:]:
            text = _fmt(getattr(r, key))
            if key in _FREE_TEXT_KEYS:
                text = _neutralize(text)
            row.append(esc(text))
        lines.append(",".join(row))
    text = "\r\n".join(lines) + "\r\n"
    return ("\ufeff" + text).encode("utf-8")  # BOM 让 Excel 正确识别 UTF-8


def registrations_to_xlsx(rows: list[Registration]) -> bytes:
    """
    导出 Excel(.xlsx)。学号 / 手机号字段强制设置 number_format="@"（文本格式），
    避免 Excel 自动转为科学计数法或丢失前导零。
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "报名记录"

    # 表头
    header_font = Font(bold=True)
    for col, (label, _) in enumerate(HEADERS_CN, start=1):
        cell = ws.cell(row=1, column=col, value=label)
        cell.font = header_font

    # 数据行
    TEXT_COLUMNS = {"student_id", "phone_number"}  # 这两列强制文本
    for i, r in enumerate(rows, 1):
        for col, (_, key) in enumerate(HEADERS_CN, start=1):
            value = str(i) if key == "index" else _fmt(getattr(r, key))
            cell = ws.cell(row=i + 1, column=col, value=value)
            cell.data_type = "s"  # 一律按字符串写入，禁止 openpyxl 把 "=..." 识别为公式
            if key in TEXT_COLUMNS:
                cell.number_format = "@"  # 强制文本，不做任何数值解析

    # 列宽（粗略）
    widths = [6, 12, 14, 20, 18, 8, 16, 20, 12, 20, 20]
    for col, w in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = w

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ==================== 通用导出（CMS 各模块复用） ====================
def _value(row: Any, key: str) -> Any:
    """从对象（属性）或字典（键）取值，兼容 ORM 实例与 dict。"""
    if isinstance(row, dict):
        return row.get(key)
    return getattr(row, key, None)


def _cell_text(v: Any) -> str:
    """统一格式化为字符串（datetime / Enum / None）。"""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if hasattr(v, "value"):  # Enum
        return v.value
    return str(v)


def to_csv(
    rows: Sequence[Any],
    headers: Sequence[tuple[str, str]],
    *,
    free_text_keys: set[str] | None = None,
    add_index: bool = True,
) -> bytes:
    """通用 CSV 导出。

    - headers: [(表头标签, 取值键), ...]
    - free_text_keys: 需做公式注入中和的自由文本列键集合
    - add_index: 是否在最前补序号列
    """
    free_text_keys = free_text_keys or set()

    def esc(s: str) -> str:
        if any(c in s for c in [",", '"', "\n", "\r"]):
            return '"' + s.replace('"', '""') + '"'
        return s

    # 表头拼接：可选在最前补序号列
    header_labels = [h for h, _ in headers]
    if add_index:
        header_labels = ["序号", *header_labels]
    lines = [",".join(esc(h) for h in header_labels)]

    for i, row in enumerate(rows, 1):
        cells = []
        if add_index:
            cells.append(str(i))
        for _, key in headers:
            text = _cell_text(_value(row, key))
            if key in free_text_keys:
                text = _neutralize(text)
            cells.append(esc(text))
        lines.append(",".join(cells))

    text = "\r\n".join(lines) + "\r\n"
    return ("\ufeff" + text).encode("utf-8")  # BOM 让 Excel 正确识别 UTF-8


def to_xlsx(
    rows: Sequence[Any],
    headers: Sequence[tuple[str, str]],
    *,
    text_columns: set[str] | None = None,
    sheet_title: str = "导出数据",
    add_index: bool = True,
) -> bytes:
    """通用 Excel(.xlsx) 导出。

    - text_columns: 需强制文本格式的列键集合（如学号/手机号）
    - 所有单元格一律按字符串写入，禁止被识别为公式
    """
    text_columns = text_columns or set()
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title

    header_font = Font(bold=True)
    header_labels = [h for h, _ in headers]
    if add_index:
        header_labels = ["序号", *header_labels]
    for col, label in enumerate(header_labels, start=1):
        cell = ws.cell(row=1, column=col, value=label)
        cell.font = header_font

    for i, row in enumerate(rows, 1):
        col = 1
        if add_index:
            c = ws.cell(row=i + 1, column=col, value=str(i))
            c.data_type = "s"
            col += 1
        for _, key in headers:
            value = _cell_text(_value(row, key))
            cell = ws.cell(row=i + 1, column=col, value=value)
            cell.data_type = "s"  # 一律字符串，防止 "=..." 被当公式
            if key in text_columns:
                cell.number_format = "@"  # 强制文本
            col += 1

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
