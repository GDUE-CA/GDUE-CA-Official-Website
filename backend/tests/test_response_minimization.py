"""响应最小化守护：公开 / 普通会员接口的响应模型不得携带内部或他人隐私字段。

遍历全部路由，按鉴权依赖剔除管理端接口（require_permission / admin 路由），
递归展开响应模型（含嵌套模型与 list），断言不出现黑名单字段。
新增接口若确需返回其中某字段，应在管理端接口返回，或单独建「本人视角」模型。
"""
import typing

from fastapi.routing import APIRoute
from pydantic import BaseModel

# 公开 / 会员接口一律不得返回的字段
FORBIDDEN = {
    "user_id", "reviewed_by", "created_by", "updated_by", "deleted_by",
    "submit_ip", "password_hash", "secret_hash", "token_hash",
    "evidence_url", "attach_url", "admin_note",
}

# 字段名 → 仅允许出现在这些（本人视角 / 管理员会话）模型中
ALLOWED = {
    # 本人登录会话列表：设备识别需要
    ("LoginSessionOut", "ip"),
}


def _walk_routes(routes):
    for r in routes:
        if isinstance(r, APIRoute):
            yield r
        elif hasattr(r, "original_router"):
            yield from _walk_routes(r.original_router.routes)


def _dep_names(dependant, acc):
    for sub in dependant.dependencies:
        acc.add(getattr(sub.call, "__qualname__", str(sub.call)))
        _dep_names(sub, acc)
    return acc


def _is_admin(route: APIRoute) -> bool:
    deps = " ".join(_dep_names(route.dependant, set()))
    return "require_permission" in deps or "admin" in deps.lower() or "/admin" in route.path


def _models(tp, seen):
    """递归收集类型注解中出现的全部 pydantic 模型。"""
    if isinstance(tp, type) and issubclass(tp, BaseModel):
        if tp in seen:
            return
        seen.add(tp)
        for f in tp.model_fields.values():
            _models(f.annotation, seen)
        return
    for arg in typing.get_args(tp):
        _models(arg, seen)


def test_public_and_member_responses_are_minimal(app):
    violations = []
    checked = 0
    for route in _walk_routes(app.routes):
        if _is_admin(route) or route.response_model is None:
            continue
        checked += 1
        models: set = set()
        _models(route.response_model, models)
        for m in models:
            for name in m.model_fields:
                if name in FORBIDDEN and (m.__name__, name) not in ALLOWED:
                    violations.append(f"{sorted(route.methods)} {route.path} → {m.__name__}.{name}")
    # 防假通过：FastAPI 会把 include 的路由包一层，遍历失效时 checked 会骤降
    assert checked > 50, checked
    assert not violations, "公开/会员接口返回了内部字段：\n" + "\n".join(sorted(set(violations)))


def test_public_member_wall_has_no_roster_fields():
    from app.schemas.member import MemberOut

    assert set(MemberOut.model_fields) == {"id", "name", "role_title", "term", "bio", "avatar_url"}


def test_public_profile_and_memo_author_have_no_user_id():
    from app.schemas.auth import RegisterOut
    from app.schemas.memo import MemoAuthorBrief
    from app.schemas.users import UserProfileOut

    for model in (UserProfileOut, MemoAuthorBrief, RegisterOut):
        assert "id" not in model.model_fields, model.__name__
