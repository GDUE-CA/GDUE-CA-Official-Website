"""安全问题预设题库（V0.5.8：题库入库，后台可 CRUD）。

历史兼容：10 条内置题保留 i18n key 常量（``sq.first_pet`` 等），启动时 seed 进
``security_preset_questions`` 表；老用户安全问题快照中存的就是这些 key。

用户安全问题答案规范化（去空格 + 小写 + SHA-256）后 bcrypt 哈希存储，
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

# 内置预设问题（启动 seed 用）：i18n key + 中文 + 英文。
# 文案必须与 frontend/i18n/messages/zh-cn.json、en-gb.json 的 sq.* 完全一致
# （用户安全问题存文本快照，前端按提交时显示文本原样提交，靠文本匹配校验）。
BUILTIN_PRESET_QUESTIONS: list[dict] = [
    {"key": "sq.first_pet", "zh": "你第一只宠物的名字？", "en": "What was the name of your first pet?"},
    {"key": "sq.childhood_hero", "zh": "你童年时的英雄是谁？", "en": "Who was your childhood hero?"},
    {"key": "sq.favorite_teacher", "zh": "你最喜欢的小学老师姓名？", "en": "What was the name of your favourite primary school teacher?"},
    {"key": "sq.birth_city", "zh": "你出生的城市？", "en": "In which city were you born?"},
    {"key": "sq.first_school", "zh": "你就读的第一所学校名称？", "en": "What was the name of your first school?"},
    {"key": "sq.mother_maiden", "zh": "你母亲的娘家姓？", "en": "What is your mother's maiden name?"},
    {"key": "sq.first_car", "zh": "你的第一辆车是什么型号？", "en": "What was the model of your first car?"},
    {"key": "sq.childhood_friend", "zh": "你童年最好朋友的名字？", "en": "What was the name of your childhood best friend?"},
    {"key": "sq.first_job", "zh": "你的第一份工作是什么？", "en": "What was your first job?"},
    {"key": "sq.favorite_book", "zh": "你最喜欢的一本书？", "en": "What is your favourite book?"},
]

# 兼容保留：旧代码引用 PRESET_SECURITY_QUESTIONS / PRESET_QUESTION_KEYS 的入口
PRESET_SECURITY_QUESTIONS: list[dict] = [
    {"key": item["key"], "min_answer_len": PRESET_MIN_ANSWER_LEN}
    for item in BUILTIN_PRESET_QUESTIONS
]

# 预设问题 key 集合（用于后端校验用户提交的 ``question`` 是否为预设题）
PRESET_QUESTION_KEYS: set[str] = {item["key"] for item in BUILTIN_PRESET_QUESTIONS}


def is_preset_question_key(key: str) -> bool:
    """判断给定字符串是否为合法预设问题 key。"""
    return key in PRESET_QUESTION_KEYS


async def is_valid_preset_question(db, text: str) -> bool:
    """校验用户提交的预设问题文本是否合法（V0.5.8 题库 DB 化后）。

    合法 = 历史 i18n key（老前端提交形态）
        或 命中任一「启用中」题库条目的 zh / en 文本（新前端提交快照形态）。
    """
    if is_preset_question_key(text):
        return True
    from sqlalchemy import select

    from app.db.models import SecurityPresetQuestion
    row = (await db.execute(
        select(SecurityPresetQuestion.id).where(
            SecurityPresetQuestion.enabled.is_(True),
            (SecurityPresetQuestion.question_zh == text)
            | (SecurityPresetQuestion.question_en == text),
        ).limit(1)
    )).first()
    return row is not None
