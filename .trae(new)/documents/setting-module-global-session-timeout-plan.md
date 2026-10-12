# 个人设置模块 /setting 完整重构 + 全局登录会话超时配置 — 实施计划

## Context

当前项目已有 `/setting/*` 个人设置8个Tab中的7个（profile/region/appearance/security/sessions/connections/notifications），但缺少 **Tab-3 区域格式（regional-format）**。Admin后台侧边栏已有可折叠分组和底部固定用户入口，基本对齐需求，但缺少**全局登录会话超时管理员配置**功能。会话空闲超时当前在后端硬编码为30分钟（非记住设备）/30天（记住设备），需求要求改为**管理员可在后台配置，预设值下拉选择，最大120分钟**。

## 实施阶段

### Phase 1: 数据库 Schema 变更

**文件: `backend/app/db/models.py`**

1. **User 模型新增区域格式字段**（8个字段，全部存编码/模式字符串）：
   - `primary_calendar`: String(16), default="gregorian"
   - `secondary_calendar`: String(16), nullable=True
   - `week_first_day`: String(16), default="monday"
   - `date_short_pattern`: String(32), default="YYYY-MM-DD"
   - `date_long_pattern`: String(32), default="YYYY年M月D日"
   - `time_short_pattern`: String(32), default="HH:mm"
   - `time_long_pattern`: String(32), default="HH:mm:ss"
   - `default_currency`: String(8), default="CNY"

2. **SystemSetting 模型新增会话超时字段**：
   - `session_idle_timeout_minutes`: Integer, default=30

### Phase 2: 后端 API 变更

**文件: `backend/app/schemas/auth.py`**
- 更新 `UserOut` 和 `ProfileUpdate` schema，新增8个区域格式字段
- 更新 `UserOut` 添加 `session_idle_timeout_minutes`（从 SystemSetting 读取后注入，或在独立接口返回）

**文件: `backend/app/schemas/system.py`**
- `SystemSettingPublicOut`: 不加敏感字段
- `SystemSettingOut`: 添加 `session_idle_timeout_minutes: int`
- `SystemSettingUpdate`: 添加 `session_idle_timeout_minutes: int | None`，校验器限制只允许 `[1,2,5,10,15,20,30,60,120]`

**文件: `backend/app/api/system.py`**
- 修改 `update_settings`：
  - 校验 `session_idle_timeout_minutes` 必须在预设列表中且 ≤120
  - 变更时写入全局审计日志（记录管理员ID、配置项名、旧值、新值、IP、UA）
  - 注意：不影响存量session，只对后续新登录生效

**文件: `backend/app/api/auth.py`**
- 修改 `PUT /api/auth/profile`：
  - 接受8个新增区域格式字段
  - 变更时写入用户审计日志（变更前后值、IP、UA）
- 修改 `POST /login`：
  - 从 SystemSetting 读取 `session_idle_timeout_minutes`，用于设置 session 的 `expires_at`（非记住设备时）
  - 记住设备仍然30天硬顶，不受此配置影响
- 添加 `GET /api/auth/profile`（如果不存在）或更新现有接口返回区域格式字段

**文件: `backend/app/core/security.py`**
- 修改 `_authenticate()` 函数（第136行附近）：
  - 当前：`idle_limit = IDLE_TIMEOUT_REMEMBER if sess.remember_device else IDLE_TIMEOUT`
  - 改为：非记住设备时，从 `SystemSetting.session_idle_timeout_minutes` 读取（缓存避免每次查DB）
  - 记住设备时保持 `IDLE_TIMEOUT_REMEMBER = 30天` 不变
  - 每次认证请求仍需更新 `last_active_at`

**文件: `backend/app/core/middleware.py`（或 security.py）**
- 在 `_authenticate()` 中增加：空闲超时后自动销毁session记录（`db.delete(sess)`或标记revoked），并写审计日志

### Phase 3: 前端 — /setting/regional-format Tab（新建）

**新建文件: `frontend/app/setting/regional-format/page.tsx`**
- 客户端页面，渲染 `RegionalFormatForm`

**新建文件: `frontend/components/setting/RegionalFormatForm.tsx`**
- 8个配置项表单卡片：
  1. 主日历（Primary Calendar）：gregorian/chinese/japanese/buddhist
  2. 第二日历（Secondary Calendar）：none/chinese/japanese/buddhist
  3. 一周起始日（Week First Day）：sunday/monday/tuesday
  4. 短日期格式（Date Short）：下拉 + 实时预览
  5. 长日期格式（Date Long）：下拉 + 实时预览
  6. 短时间格式（Time Short）：下拉 + 实时预览（12/24小时）
  7. 长时间格式（Time Long）：下拉 + 实时预览
  8. 默认货币单位（Default Currency）：CNY/USD/EUR/GBP/JPY + 名称+符号预览
- 使用 `useDirtyGuard()` 注册 dirty 状态
- 底部统一【保存更改】按钮 → `PUT /api/auth/profile`
- 【重置为匹配地区默认值】按钮：根据当前 country_code 一键填充对应地区默认格式
- 所有下拉使用原生 `<select>`（适配iOS/Android/Windows），带搜索过滤

**修改文件: `frontend/components/setting/SettingShell.tsx`**
- 在 TABS 数组中添加 regional-format 条目（Tab-3，在 region 之后、appearance 之前）

### Phase 4: 前端 — Admin 侧边栏调整

**修改文件: `frontend/app/admin/(dashboard)/layout.tsx`**

调整 `navGroups` 中的条目顺序和分组，完全对齐需求四：

1. **概览组**（无标题，不可折叠）：
   - 概览 Dashboard → `/admin`
   - 消息通知管理（当前占位，保持不变）

2. **内容管理**（可折叠）：
   - 主页公告（信息通知）→ `/admin/announcements`
   - 活动管理 → `/admin/activities`
   - 博客管理 → `/admin/blog`
   - 协作文档管理 → `/admin/content/club-intro`（名称改"协作文档管理"）
   - 社团成员管理 → `/admin/members`
   - 招新管理 → `/admin/recruitment`
   - 评论管理 → `/admin/blog/comments`
   - 内容回收站 → `/admin/recycle`

3. **资源与文件**（可折叠）：
   - 文件资源库 → `/admin/media`
   - 媒体素材库（占位）

4. **系统管理**（可折叠，roleGuard: "admin"）：
   - 用户与角色管理 → `/admin/users`
   - **站点全局设置** → `/admin/settings`（i18n key 改为 `admin.dashboard.siteGlobalSettings`）
   - 全局审计日志 → `/admin/audit-logs`
   - 第三方登录/SSO配置 → `/admin/oauth` + `/admin/sso`
   - （其余条目按现有保留：security/network, ip-whitelist, ip-blacklist, realname, review, stats）
   - 注意：需求要求"站点全局设置"包含会话超时、域名监听、IP白名单、IP黑名单、站点标题、备案、CDN等。当前 `/admin/settings` 已包含站点信息和网络配置，只需在此页面追加会话超时配置。

5. **应用与扩展**（可折叠，空组占位）：不变

底部固定区：不变（头像+用户名 → `/setting/profile`）

### Phase 5: 前端 — Admin 站点全局设置页追加会话超时

**修改文件: `frontend/app/admin/(dashboard)/settings/page.tsx`**

在现有设置页面中新增一个配置卡片：
- 标题：全局登录空闲超时
- 下拉选择器（原生 `<select>`）：
  - 选项：1分钟, 2分钟, 5分钟, 10分钟, 15分钟, 20分钟, 30分钟, 60分钟, 120分钟
  - 值（分钟）：`[1, 2, 5, 10, 15, 20, 30, 60, 120]`
  - 硬性限制最大120
- 保存时调用 `updateSystemSettings({ session_idle_timeout_minutes: value })`
- 变更后绿色提示条显示保存成功
- 页面加载时从 `fetchSystemSettings()` 读取当前值

### Phase 6: 前端 — Sessions 视图增强

**修改文件: `frontend/components/setting/SessionsView.tsx`**

在页面顶部（高危区之前）添加全局空闲超时提示文字：
- 调用 `fetchSystemSettings()` 获取 `session_idle_timeout_minutes`
- 展示：`⚠️本站全局登录空闲超时：XX分钟；闲置无操作将会被自动下线。`
- 样式：info/amber 提示条

### Phase 7: 前端类型与 API 客户端

**修改文件: `frontend/types/api.ts`**
- `AdminUser` / `ProfileUpdate` 类型中添加8个区域格式字段
- `SystemSettings` 类型中添加 `session_idle_timeout_minutes`

**修改文件: `frontend/lib/api/system.ts`**
- `updateSystemSettings` 参数类型扩展 `session_idle_timeout_minutes`

**修改文件: `frontend/lib/api/auth.ts`**
- `fetchProfile` / `updateProfile` 参数类型扩展区域格式字段

### Phase 8: i18n 翻译

更新6种语言翻译文件（`frontend/messages/*.json`）：

新增 key 列表（仅列主要新增）：
- `setting.tabs.regionalFormat` — 区域格式
- `setting.regionalFormat.title` / `.primaryCalendar` / `.secondaryCalendar` / `.weekFirstDay` / `.dateShort` / `.dateLong` / `.timeShort` / `.timeLong` / `.defaultCurrency`
- `setting.regionalFormat.resetToDefault` — 重置为匹配地区默认值
- `admin.dashboard.siteGlobalSettings` — 站点全局设置
- `admin.settings.sessionIdleTimeout` — 全局登录空闲超时
- `admin.settings.sessionIdleTimeoutDesc` — 说明文字
- `setting.sessions.globalTimeoutNotice` — 全局超时提示（带插值 `{minutes}`）

所有语言（zh-cn, zh-tw, zh-hk, en-us, en-gb, ja）同步补齐。

### Phase 9: 验证

1. **tsc 零错误**：`node node_modules\typescript\bin\tsc --noEmit`
2. **pytest 全量通过**：`pytest tests/`（后端单元测试）
3. **端到端浏览器验证**：
   - `/setting/regional-format` 页面渲染、下拉交互、保存成功
   - Tab 切换 dirty guard 弹窗正常
   - `/admin/settings` 会话超时配置下拉、保存、刷新后值保持
   - `/setting/sessions` 显示全局超时提示文字
   - Admin 侧边栏分组折叠/展开状态持久化正常
   - 底部固定用户入口跳转 `/setting/profile` 正常
4. **会话超时行为验证**：
   - 修改超时为1分钟 → 等待1分钟无操作 → 下一个请求应401
   - 修改超时为120分钟 → 会话保持更久
   - 修改配置不影响已登录session（需重新登录才生效）

## 关键文件清单（修改/新建）

### 后端修改
| 文件 | 变更 |
|------|------|
| `backend/app/db/models.py` | User+8字段, SystemSetting+1字段 |
| `backend/app/schemas/auth.py` | UserOut/ProfileUpdate 扩展 |
| `backend/app/schemas/system.py` | SystemSettingOut/Update 扩展 + 校验器 |
| `backend/app/api/system.py` | 会话超时配置管理 + 审计日志 |
| `backend/app/api/auth.py` | profile更新接受区域格式, login读取超时配置 |
| `backend/app/core/security.py` | `_authenticate()` 动态读取超时配置 |

### 前端修改
| 文件 | 变更 |
|------|------|
| `frontend/components/setting/SettingShell.tsx` | 添加 regional-format Tab |
| `frontend/components/setting/RegionalFormatForm.tsx` | **新建** 区域格式表单 |
| `frontend/app/setting/regional-format/page.tsx` | **新建** 路由页面 |
| `frontend/app/admin/(dashboard)/layout.tsx` | 调整侧边栏条目顺序/命名 |
| `frontend/app/admin/(dashboard)/settings/page.tsx` | 追加会话超时配置卡片 |
| `frontend/components/setting/SessionsView.tsx` | 添加全局超时提示 |
| `frontend/types/api.ts` | 类型扩展 |
| `frontend/lib/api/system.ts` | API 参数扩展 |
| `frontend/lib/api/auth.ts` | API 参数扩展 |
| `frontend/messages/*.json` | 6语言翻译补齐 |

## 约束与注意事项

1. **禁止新建 middleware.ts**：Next.js 16 只允许 proxy.ts，两者共存会导致 dev server 假死。
2. **数据库字段只存编码**：区域格式所有字段存字符串编码，禁止存中文显示文字。
3. **存量会话不受影响**：修改全局超时配置后，已登录用户的 session 保持原有 `expires_at`，直到重新登录才按新配置生效。
4. **记住设备不受全局超时影响**：勾选「记住此设备」仍然硬顶30天，这是独立逻辑。
5. **审计日志**：
   - 用户修改个人设置 → `AuditLog` 表（action 如 `profile.update`, `regional_format.update`）
   - 管理员修改全局超时 → `AuditLog` 表（action 如 `system.session_timeout.update`）
6. **空闲超时计算**：基于 `last_active_at`，不是登录时刻。每次认证请求自动更新 `last_active_at` 实现滑动续期。
7. **后端通用架构**：区域格式和会话超时配置均为通用SaaS架构，无社团硬编码逻辑。
