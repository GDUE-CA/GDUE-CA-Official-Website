#!/usr/bin/env python3
"""启动脚本：默认仅监听本机回环（浏览器经前端同源 /api 反代访问后端）。

监听地址 / 端口读取 .env 或环境变量 HOST / PORT，例如 HOST=:: 监听 IPv4+IPv6 双栈。
"""
import uvicorn

from app.core.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        # 访问日志由 app.core.trace 中间件输出（统一格式 + traceId），关闭 uvicorn 自带的
        access_log=False,
        # 不让 uvicorn 套用自己的日志配置，沿用 app.core.log 的统一格式
        log_config=None,
        # 关闭 uvicorn 自带的代理头改写：客户端 IP / 协议 / traceId 统一由
        # app.core.middleware 按 TRUSTED_PROXIES 判定，避免两层逻辑叠加
        proxy_headers=False,
        reload=False,
        log_level="info",
    )
