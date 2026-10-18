"""全局配置，从 .env 或环境变量读取。"""
import logging
import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("gdueca.config")

# 项目版本号（全站唯一真值源）：升级版本只改这一处，
# 前端对应常量 app 端 lib/version.ts 的 APP_VERSION，两者必须保持一致。
PROJECT_VERSION = "v0.6.0"

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
    # 管理员级账号（editor / admin / super_admin 及 Break-Glass）可信来源 IP 白名单；
    # 逗号分隔 IP / CIDR。默认空 = 不限制来源 IP（防爆破 / 指纹限流照常生效）；
    # 填入一个或多个条目后开启白名单模式：仅列表内来源可登录 / 使用管理员账号
    ADMIN_TRUSTED_IPS: str = ""
    # 可信反向代理（Nginx / Caddy / Next.js rewrites）；只有来自这些地址的
    # X-Forwarded-For 才会被采信，防止客户端伪造 IP 绕过内网限制
    TRUSTED_PROXIES: str = "127.0.0.1/32,::1/128"

    # ---- 日志 ----
    LOG_LEVEL: str = "INFO"
    # text：人读友好的单行文本；json：一行一个 JSON，便于日志系统采集
    LOG_FORMAT: str = "text"

    # ---- API 文档（生产环境建议关闭，减少暴露面） ----
    ENABLE_API_DOCS: bool = False

    # ---- 全局限流（令牌桶，每 IP） ----
    RATE_LIMIT_PER_MIN: int = 120   # 每分钟补充令牌数
    RATE_LIMIT_BURST: int = 30      # 桶容量（允许的瞬时突发）

    # ---- Break-Glass 应急账号 ----
    # 启动默认凭据 admin / admin（首次登录后系统强制进入初始化向导并改密；
    # 生产部署应覆盖此默认 —— 留空时自动回落到 admin/admin，显式配置则以 env 为准）。
    # 注意：默认哈希为 bcrypt rounds=12，明文 "admin" 的哈希值由 hash_password("admin") 预生成。
    SUPER_ADMIN_USERNAME: str = "admin"
    SUPER_ADMIN_PASSWORD_HASH: str = (
        "$2b$12$N.xxjoNZt4mi2Trf4Bmq1e0l46NFNTf9.6CBFZGueUZhlWfFAvnYC"
    )
    SUPER_ADMIN_ENABLED: str = "true"

    # ---- 通用 KV 存储（防爆破计数/封禁/Break-Glass 会话） ----
    # 配置 redis://... 时使用 Redis（多 worker 共享）；留空使用进程内存兜底（仅单进程开发）
    REDIS_URL: str = ""

    # ---- IP 情报（后台访问统计的国家 / ASN；留空则只用本地 GeoLite2） ----
    # 请求 {IP_INFO_API_URL}/{ip}，返回 ipinfo / iplocate / maxmind 多源结果
    IP_INFO_API_URL: str = "https://risk.catyuki.com/api/v1/info"

    # ---- SMTP 邮件（忘记密码验证码等；底层基础设施，与业务无关） ----
    # SMTP_HOST 留空 = 未配置邮件服务：发送方自行降级（验证码仅记录到服务端日志，仅限开发环境）
    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""  # 授权码 / 密码
    SMTP_FROM: str = ""  # 发件人地址；留空时取 SMTP_USERNAME
    SMTP_FROM_NAME: str = "GDUE-CA"  # 发件人显示名
    # True = SSL 直连（465）；False = STARTTLS（587）
    SMTP_USE_SSL: bool = True

    # ---- 发信通道：smtp（默认）/ graph（Microsoft Graph sendMail，走 HTTPS 443） ----
    # graph 适用于 Exchange Online 停用 SMTP 基本认证、或云主机封禁出站 SMTP 端口的场景；
    # 需在 Entra ID 注册应用并授予 Mail.Send「应用程序权限」+ 管理员同意，
    # 强烈建议用 RBAC for Applications / Application Access Policy 限定只能以 GRAPH_SENDER 发信。
    MAIL_PROVIDER: str = "smtp"
    GRAPH_TENANT_ID: str = ""
    GRAPH_CLIENT_ID: str = ""
    GRAPH_CLIENT_SECRET: str = ""
    # 发件邮箱（Exchange Online 中真实存在的邮箱 / 共享邮箱）；留空时取 SMTP_FROM
    GRAPH_SENDER: str = ""
    # 邮箱验证码：有效期固定 5 分钟 + 单码最大验证尝试次数 + 同邮箱重发间隔（秒）
    EMAIL_CODE_TTL_SECONDS: int = 300
    EMAIL_CODE_MAX_ATTEMPTS: int = 5
    EMAIL_CODE_RESEND_INTERVAL_SECONDS: int = 60
    # 更换绑定邮箱验证码：有效期 15 分钟（需求规定）；尝试次数 / 重发间隔复用上面三项
    EMAIL_CHANGE_CODE_TTL_SECONDS: int = 900
    # V0.5.5 §4：站内邮件大附件保存期限（天）。到期定时任务只删除磁盘附件文件，
    # 邮件正文完整保留；邮件系统落地后将附件记录清理接入 maintenance 清理钩子
    MAIL_ATTACHMENT_RETENTION_DAYS: int = 7
    # 数据库写操作审计（db_traces / db_change_logs）保留期限（天），定时维护任务每小时清理
    DB_TRACE_RETENTION_DAYS: int = 30

    # ---- 内容翻译（DeepL）：CMS 内容只维护中 / 英两个版本，中文原文译英文、英文原文译中文 ----
    # 留空则不翻译（一律展示原文）；Free 版 key 以 ":fx" 结尾，自动走 api-free.deepl.com
    DEEPL_API_KEY: str = ""
    # 自定义接口地址（一般无需配置，留空按 key 类型自动选择）
    DEEPL_API_URL: str = ""

    @property
    def break_glass_enabled(self) -> bool:
        return self.SUPER_ADMIN_ENABLED.strip().lower() == "true"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip() and o.strip() != "*"]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.ALLOWED_HOSTS.split(",") if h.strip()]

    @property
    def admin_trusted_ips_list(self) -> list[str]:
        return [n.strip() for n in self.ADMIN_TRUSTED_IPS.split(",") if n.strip()]

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
    # 首次加载配置时即初始化统一日志，保证启动阶段（含下面的密钥告警）也是统一格式
    from app.core.log import setup_logging
    setup_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    _ensure_jwt_secret(settings)
    return settings
