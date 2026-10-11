"""成员管理：Excel 模板下载 / 批量导入 / 批量改届别职务。

注：文件名刻意以 z 开头，使本文件在 test_security / test_trace 之后执行——
全文件共享 session 级测试库，本文件的超管首次改密会改变初始态，
排最后可避免干扰 test_security 对全新超管状态的断言。
"""
import io

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from tests.conftest import csrf, make_client
from tests.test_security import _admin_client


def _make_import_xlsx(rows: list[dict], headers: list[str] | None = None) -> bytes:
    headers = headers or ["职务", "姓名", "性别", "年级", "所在院系", "专业及班级",
                          "联系电话", "微信号", "政治面貌", "是否为留学生", "届别"]
    wb = Workbook()
    ws = wb.active
    for c, h in enumerate(headers, start=1):
        ws.cell(row=1, column=c, value=h)
    for i, row in enumerate(rows, start=2):
        for c, h in enumerate(headers, start=1):
            ws.cell(row=i, column=c, value=row.get(h))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _import(client: TestClient, headers: dict, payload: bytes, mode="skip", filename="members.xlsx"):
    return client.post(
        "/api/admin/members/import",
        files={"file": (filename, payload, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"mode": mode},
        headers=headers,
    )


def test_template_download(app):
    client, headers = _admin_client(app)
    res = client.get("/api/admin/members/template", headers=headers)
    assert res.status_code == 200, res.text
    assert "spreadsheetml" in res.headers["content-type"]
    assert "members_template.xlsx" in res.headers["content-disposition"]
    ws = load_workbook(filename=io.BytesIO(res.content), read_only=True).active
    got = [ws.cell(1, c).value for c in range(1, ws.max_column + 1)]
    assert got == ["职务", "姓名", "性别", "年级", "所在院系", "专业及班级",
                   "联系电话", "微信号", "政治面貌", "是否为留学生", "届别"]
    assert ws.max_row == 1  # 空白模板：只有表头


def test_import_skip_and_update(app):
    client, headers = _admin_client(app)
    rows = [
        {"姓名": "张三", "职务": "会长", "性别": "男", "年级": "2025级", "所在院系": "计算机学院",
         "专业及班级": "25软件A班", "联系电话": "13800001111", "微信号": "zhangsan",
         "政治面貌": "共青团员", "是否为留学生": "否", "届别": "现任"},
        {"姓名": "李四", "职务": "普通会员", "届别": "往届"},
        {"姓名": "", "职务": "空行应跳过"},
    ]
    res = _import(client, headers, _make_import_xlsx(rows))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body == {"total": 2, "created": 2, "updated": 0, "skipped": 0, "errors": []}

    # 管理列表含敏感字段
    lst = client.get("/api/admin/members?q=张三", headers=headers).json()
    assert lst["total"] == 1
    m = lst["items"][0]
    assert m["phone"] == "13800001111" and m["wechat"] == "zhangsan"
    assert m["grade"] == "2025级" and m["term"] == "current"

    # 公开接口不含敏感字段
    pub = client.get("/api/members").json()
    zhang = next(x for x in pub if x["name"] == "张三")
    assert "phone" not in zhang and "wechat" not in zhang
    assert zhang["grade"] == "2025级"

    # skip 模式：重复跳过 + 更新 1 条新记录
    res2 = _import(client, headers, _make_import_xlsx([
        {"姓名": "张三", "职务": "前会长"},
        {"姓名": "王五", "职务": "普通会员"},
    ]), mode="skip")
    assert res2.json() == {"total": 2, "created": 1, "updated": 0, "skipped": 1, "errors": []}
    assert client.get("/api/admin/members?q=张三", headers=headers).json()["items"][0]["role_title"] == "会长"

    # update 模式：非空覆盖，空单元格保持原值
    res3 = _import(client, headers, _make_import_xlsx([
        {"姓名": "张三", "职务": "前会长", "届别": "往届"},
    ]), mode="update")
    assert res3.json() == {"total": 1, "created": 0, "updated": 1, "skipped": 0, "errors": []}
    m3 = client.get("/api/admin/members?q=张三", headers=headers).json()["items"][0]
    assert m3["role_title"] == "前会长" and m3["term"] == "former"
    assert m3["phone"] == "13800001111"  # 空单元格未覆盖


def test_import_row_errors(app):
    client, headers = _admin_client(app)
    res = _import(client, headers, _make_import_xlsx([
        {"姓名": "赵六", "届别": "荣誉会员"},   # 非法届别
        {"姓名": "钱七", "是否为留学生": "maybe"},  # 非法留学生
        {"姓名": "孙八" * 40},  # 超长姓名
    ]))
    body = res.json()
    assert body["created"] == 0 and len(body["errors"]) == 3
    reasons = " ".join(e["reason"] for e in body["errors"])
    assert "届别" in reasons and "留学生" in reasons


def test_import_rejects_non_xlsx(app):
    client, headers = _admin_client(app)
    res = _import(client, headers, b"not excel", filename="members.csv")
    assert res.status_code == 400


def test_import_original_table_format(app):
    """直接上传原信息表格式（含标题行/多余列）也能解析。"""
    client, headers = _admin_client(app)
    wb = Workbook()
    ws = wb.active
    ws.cell(1, 1, value="计算机协会现有成员构成表")
    for c, h in enumerate(["序号", "职务", "姓名", "性别", "年级", "所在院系",
                           "专业及班级", "联系电话", "微信号"], start=1):
        ws.cell(2, c, value=h)
    ws.cell(3, 1, value=1)
    ws.cell(3, 2, value="技术理事")
    ws.cell(3, 3, value="原表成员")
    ws.cell(3, 8, value="13900002222")
    buf = io.BytesIO()
    wb.save(buf)
    res = _import(client, headers, buf.getvalue())
    assert res.json()["created"] == 1
    m = client.get("/api/admin/members?q=原表成员", headers=headers).json()["items"][0]
    assert m["role_title"] == "技术理事" and m["phone"] == "13900002222"
    assert m["term"] == "current"


def test_batch_update_term_and_role(app):
    client, headers = _admin_client(app)
    ids = []
    for name in ("批量A", "批量B"):
        r = client.post("/api/admin/members", json={"name": name}, headers={**headers, **csrf(client)})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    res = client.post("/api/admin/members/batch",
                      json={"ids": [*ids, 999999], "term": "former", "role_title": "普通会员"},
                      headers={**headers, **csrf(client)})
    assert res.status_code == 200, res.text
    assert res.json() == {"updated": 2, "not_found": [999999]}
    for i in ids:
        m = client.get(f"/api/admin/members/{i}", headers=headers).json()
        assert m["term"] == "former" and m["role_title"] == "普通会员"


def test_batch_requires_field(app):
    client, headers = _admin_client(app)
    res = client.post("/api/admin/members/batch", json={"ids": [1]},
                      headers={**headers, **csrf(client)})
    assert res.status_code == 400


def test_import_requires_manage_permission(app):
    anon = make_client(app, ip="10.9.9.9")  # 独立 IP：避开其他用例攒下的匿名限流桶
    res = anon.post("/api/admin/members/import", files={"file": ("a.xlsx", b"x")})
    assert res.status_code in (401, 403)
