"""安全问题预设题库（系统常量，不入库）。

预设问题存 i18n key（如 ``sq.first_pet``），前端按 locale 渲染本地化文本；
自输入问题存用户原文。答案规范化（去空格 + 小写 + SHA-256）后 bcrypt 哈希存储，
恢复时答对 3 个中 2 个即可重置密码。
"""
from __future__ import annotations

# 预设答案最小长度（预设题答案归一化后需 ≥ 2 字符）
PRESET_MIN_ANSWER_LEN = 2
# 自定义问题答案最小长度（避免短答案被枚举猜中）
CUSTOM_MIN_ANSWER_LEN = 6
# 每位用户必须设置的安全问题数量
SECURITY_QUESTIONS_COUNT = 3
# 恢复时需答对的最小数量（2/3）
RECOVER_MIN_CORRECT = 2

# 预设问题列表：每项含 i18n key 与建议答案最小长度（前端校验提示用）。
# 后端校验答案长度时，预设题用 PRESET_MIN_ANSWER_LEN，自定义题用 CUSTOM_MIN_ANSWER_LEN。
PRESET_SECURITY_QUESTIONS: list[dict] = [
    {"key": "sq.first_pet", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.childhood_hero", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.favorite_teacher", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.birth_city", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.first_school", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.mother_maiden", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.first_car", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.childhood_friend", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.first_job", "min_answer_len": PRESET_MIN_ANSWER_LEN},
    {"key": "sq.favorite_book", "min_answer_len": PRESET_MIN_ANSWER_LEN},
]

# 预设问题 key 集合（用于后端校验用户提交的 ``question`` 是否为预设题）
PRESET_QUESTION_KEYS: set[str] = {item["key"] for item in PRESET_SECURITY_QUESTIONS}


def is_preset_question_key(key: str) -> bool:
    """判断给定字符串是否为合法预设问题 key。"""
    return key in PRESET_QUESTION_KEYS
