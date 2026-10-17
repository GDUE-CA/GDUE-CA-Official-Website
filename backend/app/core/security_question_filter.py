"""自定义安全问题内容黑名单过滤（V0.5.8）。

注册 / 设置安全问题 / 后台题库录入统一调用 check_question_text，
命中黑名单返回拒绝原因（422 文案），未命中返回 None。
"""
from __future__ import annotations

import re

# 个人敏感信息：模式匹配（命中即拒绝）
_PRIVACY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"1[3-9]\d{9}"), "请勿填写手机号等个人隐私信息"),
    (re.compile(r"\d{17}[\dXx]"), "请勿填写身份证号等个人隐私信息"),
    (re.compile(r"(?<!\d)\d{16,19}(?!\d)"), "请勿填写银行卡号等个人隐私信息"),
    (re.compile(r"(?<![A-Za-z0-9])[EGPegp]\d{8}(?!\d)"), "请勿填写护照等证件编号信息"),
    (re.compile(r"\d{4}[-/年]\s?\d{1,2}[-/月]\s?\d{1,2}日?"), "请勿填写生日等日期类个人隐私信息"),
]

# 个人敏感信息：关键词（问题语义指向隐私，命中即拒绝）
_PRIVACY_KEYWORDS: tuple[str, ...] = (
    "身份证", "护照", "港澳通行证", "台胞证", "驾驶证", "驾照",
    "银行卡", "信用卡", "社保卡", "医保卡", "公积金",
    "学号", "工号", "学籍号", "考生号", "准考证",
    "手机号", "电话号码", "联系电话",
    "生日", "出生日期", "出生年月",
    "户籍", "户口", "家庭住址", "家庭地址",
    "id card", "passport", "social security", "credit card",
    "bank card", "phone number", "date of birth",
)

# 敏感政治 / 历史 / 争议内容：关键词（命中即拒绝）
_SENSITIVE_KEYWORDS: tuple[str, ...] = (
    # 极端主义 / 纳粹 / 恐怖主义
    "纳粹", "nazi", "希特勒", "hitler", "法西斯", "fascist",
    "恐怖主义", "terrorist", "terrorism", "圣战", "jihad",
    "种族灭绝", "genocide",
    # 敏感政治 / 地区争议
    "台独", "港独", "藏独", "疆独", "分裂国家",
    "台湾独立", "香港独立", "两个中国", "一中一台",
    "两岸问题", "武统",
    # 敏感历史 / 二战争议
    "南京大屠杀", "慰安妇", "靖国神社", "七三一",
    # 违规时政
    "反共", "反华", "颠覆", "颜色革命",
)

_SENSITIVE_REASON = "请勿填写敏感历史、政治争议内容"


def check_question_text(text: str) -> str | None:
    """检查自定义安全问题文本是否命中黑名单。

    返回拒绝原因（中文，直接作为 422 报错文案）；未命中返回 ``None``。
    大小写不敏感；先做模式匹配（具体信息形态），再做关键词匹配（语义指向）。
    """
    if not text:
        return None
    lowered = text.lower()
    for pattern, reason in _PRIVACY_PATTERNS:
        if pattern.search(text):
            return reason
    for kw in _PRIVACY_KEYWORDS:
        if kw.lower() in lowered:
            return "请勿填写身份证、学号、护照、手机号等个人隐私信息"
    for kw in _SENSITIVE_KEYWORDS:
        if kw.lower() in lowered:
            return _SENSITIVE_REASON
    return None
