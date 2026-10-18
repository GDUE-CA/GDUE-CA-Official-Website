"""内容翻译（DeepL，中 / 英两版）回归测试。

超管登录复用 test_db_trace 的预置账号（不依赖初始超管的改密状态）。

覆盖：
- 显示语言归一：zh-* → 中文版，其余 19 门界面语言 → 英文版，非法语言不翻译
- 中文原文只译英文、英文原文只译中文；同版本不调用外部接口
- 后台保存公告即预翻译入库；公开接口按 lang 返回译文且不再调用 DeepL
- 未配置 key / 接口异常：展示原文，不影响保存
"""
import asyncio

import pytest

from app.utils import translator
from app.utils.translator import content_lang
from tests.test_db_trace import _admin_client


@pytest.fixture
def deepl_calls(monkeypatch):
    """替换 DeepL 调用：记录 (texts, target) 并返回可识别的假译文。"""
    calls: list[tuple[list[str], str]] = []

    async def fake(texts, target):
        calls.append((list(texts), target))
        return [f"[{target}]{t}" for t in texts]

    monkeypatch.setattr(translator, "_translate_deepl", fake)
    return calls


def _data(res):
    body = res.json()
    return body["data"] if isinstance(body, dict) and "code" in body else body


@pytest.mark.parametrize(
    ("lang", "expected"),
    [
        ("zh-cn", "zh"), ("zh-HK", "zh"), ("zh-yue-tw", "zh"),
        ("en-us", "en"), ("de-de", "en"), ("ja-jp", "en"), ("ar-sa", "en"),
        (None, None), ("", None), ("xx-yy", None),
    ],
)
def test_content_lang(lang, expected):
    assert content_lang(lang) == expected


def test_announcement_pretranslated_on_save(app, deepl_calls):
    client, headers = _admin_client(app)
    res = client.post("/api/admin/announcements", headers=headers, json={
        "title": "招新公告", "content": "扫码入群", "category": "home",
    })
    assert res.status_code in (200, 201), res.text
    aid = _data(res)["id"]
    # 中文原文 → 只预翻译英文，标题与正文合并为一次调用
    assert deepl_calls == [(["招新公告", "扫码入群"], "en")]

    deepl_calls.clear()
    item = next(a for a in _data(client.get("/api/announcements?category=home&lang=de-de")) if a["id"] == aid)
    assert (item["title"], item["content"]) == ("[en]招新公告", "[en]扫码入群")
    # 中文界面直接展示原文；两次读取都命中库，不再调用 DeepL
    item = _data(client.get(f"/api/announcements/{aid}?lang=zh-hk"))
    assert item["title"] == "招新公告"
    assert deepl_calls == []

    # 改成英文原文 → 预翻译中文
    res = client.put(f"/api/admin/announcements/{aid}", headers=headers, json={
        "title": "Recruitment", "content": "Scan to join",
    })
    assert res.status_code == 200, res.text
    assert deepl_calls == [(["Recruitment", "Scan to join"], "zh")]
    item = _data(client.get(f"/api/announcements/{aid}?lang=zh-cn"))
    assert item["title"] == "[zh]Recruitment"
    assert _data(client.get(f"/api/announcements/{aid}?lang=en-gb"))["title"] == "Recruitment"


def test_translate_failure_falls_back(app, monkeypatch):
    async def boom(texts, target):
        raise RuntimeError("down")

    monkeypatch.setattr(translator, "_translate_deepl", boom)
    client, headers = _admin_client(app)
    res = client.post("/api/admin/announcements", headers=headers, json={
        "title": "故障测试公告", "content": "原文展示", "category": "home",
    })
    assert res.status_code in (200, 201), res.text
    aid = _data(res)["id"]
    assert _data(client.get(f"/api/announcements/{aid}?lang=en-us"))["title"] == "故障测试公告"


def test_no_key_returns_none(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "DEEPL_API_KEY", "")
    assert asyncio.run(translator._translate_deepl(["你好"], "en")) is None
