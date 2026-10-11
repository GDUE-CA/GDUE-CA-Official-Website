"""活动实时统计回归测试：GET /api/admin/stats/activities/live 覆盖全部活动（左连接，无报名也出现）。

注：文件名以 z 开头，使本文件在 test_security / test_trace 之后执行——
全文件共享 session 级测试库，超管首次改密会改变初始态（同 test_zmembers_import 约定）。
"""
from tests.conftest import csrf
from tests.test_security import _admin_client


def test_activities_live_shape(app):
    client, headers = _admin_client(app)
    r = client.get("/api/admin/stats/activities/live", headers=headers)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_activities_live_includes_new_activity(app):
    client, headers = _admin_client(app)
    r = client.post("/api/activities", headers={**headers, **csrf(client)}, json={
        "title": "实时统计探测活动", "content": "内容",
    })
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    rows = client.get("/api/admin/stats/activities/live", headers=headers).json()
    mine = [x for x in rows if x["activity_id"] == aid]
    assert mine, "new activity must appear via LEFT JOIN"
    assert mine[0]["total"] == 0
    for key in ("pending", "approved", "rejected", "checked_in", "activity_name"):
        assert key in mine[0]
