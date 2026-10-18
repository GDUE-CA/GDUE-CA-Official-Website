"""粗粒度设备类别（公开展示用）：只区分平台，不含机型 / 系统版本 / 浏览器版本。

登录会话列表用的 api.auth.parse_user_agent 会解析出具体机型号与版本，
公开展示会构成设备指纹；评论等公开场景一律用本模块的类别枚举。
"""

DEVICE_CATEGORIES = ("iphone", "ipad", "android", "windows", "macos", "linux", "other")


def device_category(ua: str | None) -> str:
    """User-Agent → 设备类别枚举（前端按枚举渲染图标与本地化名称）。"""
    if not ua:
        return "other"
    if "iPhone" in ua:
        return "iphone"
    # iPadOS 13+ 默认桌面版 UA 自称 Macintosh，无法区分时归入 macos
    if "iPad" in ua:
        return "ipad"
    if "Android" in ua:
        return "android"
    if "Windows" in ua:
        return "windows"
    if "Mac OS X" in ua or "Macintosh" in ua:
        return "macos"
    if "Linux" in ua or "X11" in ua:
        return "linux"
    return "other"
