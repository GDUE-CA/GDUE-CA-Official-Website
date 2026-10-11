"""全局配置，从 .env 或环境变量读取。"""
import logging
import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("gdueca.config")

# 已知的弱 / 示例 JWT 密钥：命中时自动生成随机密钥，禁止用于签名
_WEAK_JWT_SECRETS = {
    "",
    "dev-secret-change-me",
    "change-me-to-a-long-random-string",
    "secret",
    "changeme",
}
# 自动生成的 JWT 密钥持久化文件（权限 0600，已在 .gitignore 中忽略）
_JWT_SECRET_FILE = Path(".jwt_secret")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- 服务监听（python run.py 使用） ----
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # ---- 数据库 ----
    DATABASE_URL: str = "sqlite+aiosqlite:///./assoc.db"

    # ---- JWT ----
    JWT_SECRET_KEY: str = Field(default="", alias="JWT_SECRET_KEY")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    # ---- 登录 Cookie ----
    # true / false / auto（auto = 按请求协议判断，HTTPS 下自动加 Secure）
    COOKIE_SECURE: str = "auto"

    # ---- CORS / Host ----
    # 仅在前后端跨域部署时需要；推荐通过前端同源反代 /api，无需 CORS
    CORS_ORIGINS: str = "http://localhost:3000"
    ALLOWED_HOSTS: str = ""  # 逗号分隔；空则不校验

    # ---- 网络访问控制（GB/T 22239 访问控制 / 边界防护） ----
    # 管理员级账号（editor / admin / super_admin）仅允许从这些网段访问；逗号分隔 CIDR
    ADMIN_ALLOWED_NETWORKS: str = (
        "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"
    )
    # 可信反向代理（Nginx / Caddy / Next.js rewrites）；只有来自这些地址的
    # X-Forwarded-For 才会被采信，防止客户端伪造 IP 绕过内网限制
    TRUSTED_PROXIES: str = "127.0.0.1/32,::1/128"

    # ---- 登录失败处理（GB/T 22239 身份鉴别） ----
    LOGIN_MAX_FAILURES: int = 5       # 连续失败次数阈值
    LOGIN_LOCK_MINUTES: int = 15      # 锁定时长

    # ---- 日志 ----
    LOG_LEVEL: str = "INFO"
    # text：人读友好的单行文本；json：一行一个 JSON，便于日志系统采集
    LOG_FORMAT: str = "text"

    # ---- API 文档（生产环境建议关闭，减少暴露面） ----
    ENABLE_API_DOCS: bool = False

    # ---- 全局限流（令牌桶，每 IP） ----
    RATE_LIMIT_PER_MIN: int = 120   # 每分钟补充令牌数
    RATE_LIMIT_BURST: int = 30      # 桶容量（允许的瞬时突发）

    # ---- 初始化超级管理员 ----
    # 首次启动时创建；若口令不满足强口令策略，将自动生成随机强口令并输出到启动日志
    FIRST_SUPERADMIN_EMAIL: str = "admin@gdue-ca.cn"
    FIRST_SUPERADMIN_PASSWORD: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip() and o.strip() != "*"]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.ALLOWED_HOSTS.split(",") if h.strip()]

    @property
    def admin_networks_list(self) -> list[str]:
        return [n.strip() for n in self.ADMIN_ALLOWED_NETWORKS.split(",") if n.strip()]

    @property
    def trusted_proxies_list(self) -> list[str]:
        return [n.strip() for n in self.TRUSTED_PROXIES.split(",") if n.strip()]


def _ensure_jwt_secret(settings: Settings) -> None:
    """弱 / 缺省 JWT 密钥 → 读取或生成持久化随机密钥，避免 token 被伪造。"""
    if settings.JWT_SECRET_KEY not in _WEAK_JWT_SECRETS and len(settings.JWT_SECRET_KEY) >= 32:
        return
    if _JWT_SECRET_FILE.exists():
        settings.JWT_SECRET_KEY = _JWT_SECRET_FILE.read_text(encoding="utf-8").strip()
        return
    key = secrets.token_urlsafe(64)
    _JWT_SECRET_FILE.write_text(key, encoding="utf-8")
    os.chmod(_JWT_SECRET_FILE, 0o600)
    settings.JWT_SECRET_KEY = key
    logger.warning("JWT_SECRET_KEY 未配置或强度不足，已生成随机密钥并保存到 %s", _JWT_SECRET_FILE)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _ensure_jwt_secret(settings)
    return settings
