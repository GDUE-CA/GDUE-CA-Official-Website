"""地区与行政区接口（公开，无需登录）。

- GET /api/geo/countries     全部国家/地区列表（CN/HK/MO/TW 置顶）
- GET /api/geo/subdivisions  指定国家的行政区树（has_second_level 控制前端二级渲染）
- GET /api/geo/detect        基于客户端 IP 自动探测国家代码（GeoLite2）
"""
from fastapi import APIRouter, HTTPException, Query, Request

from app.core.ip_location import resolve_country_code
from app.core.middleware import get_client_ip
from app.data.geo_data import get_country, get_countries, get_subdivisions

router = APIRouter(prefix="/api/geo", tags=["geo"])


@router.get("/countries")
async def list_countries():
    """全部国家/地区；CN/HK/MO/TW 置顶，其余按英文名排序。"""
    return get_countries()


@router.get("/subdivisions")
async def list_subdivisions(country: str = Query(..., min_length=2, max_length=2)):
    """指定国家的行政区树。

    - has_second_level=true：同时渲染一级、二级两个下拉；
    - has_second_level=false：只渲染一级下拉；
    - items=[]：两个下拉全部隐藏，前端降级为自由文本输入。
    """
    iso2 = country.upper()
    if get_country(iso2) is None:
        raise HTTPException(status_code=400, detail="无效的国家/地区代码")
    has_second_level, items = get_subdivisions(iso2)
    return {"has_second_level": has_second_level, "items": items}


@router.get("/detect")
async def detect_country(request: Request):
    """基于客户端 IP 自动探测国家代码（仅回填国家，子行政区由用户手动确认）。"""
    iso2 = resolve_country_code(get_client_ip(request))
    return {"iso2": iso2}
