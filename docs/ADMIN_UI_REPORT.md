# 后台管理 UI 功能验证报告

> 交付物：后台管理 UI 页面（项目管理全闭环）+ 配套功能验证报告
> 规范真值源：[docs/SPEC.md](SPEC.md)
> 日期：2026-10-11

---

## 一、现状评估结论

### 1.1 现有后台入口盘点

对 `frontend/app/admin/(dashboard)/` 全量路由盘点后确认：后台实际已有 **26 个页面 / 25+ 功能模块**，绝大部分完整可用：

| 分组 | 模块 |
|---|---|
| 内容管理 | 博客（列表/新建/编辑）、活动（列表/新建/编辑）、内容块 |
| 数据管理 | 项目（**仅 API，UI 缺失**） |
| 用户体系 | 用户管理、成员管理、实名审核、注册审核、招新管理 |
| 运营 | 公告管理、媒体库、Memo 笔记 |
| 系统 | OAuth 应用、SSO 管理、站点设置、安全设置（密码策略/会话管理/安全问题）、审计日志、统计（×3） |

### 1.2 明确的问题清单

| # | 问题 | 严重度 | 处理 |
|---|---|---|---|
| 1 | **项目管理后台 UI 完全缺失**——后端 `app/api/projects.py` 管理 CRUD（view/manage 权限点、审计埋点）已就绪，前端 `lib/api/projects.ts` 已有 5 个 admin 函数，但无任何页面入口 | 高（唯一功能缺口） | 本轮补齐 |
| 2 | **前端权限镜像缺 projects 模块**——后端 `app/core/permissions.py` 为 22 模块（含 projects、memo），前端 `lib/permissions.ts` 仅 21 个，导致 super_admin/admin/editor 三角色默认矩阵不含 projects，非超级管理员无法访问项目管理 | 高 | 本轮修复 |
| 3 | **活动表单时区错位 bug**——`ActivityForm` 回填 `initial.start_at.slice(0, 16)` 把 UTC 值当本地时间填入 `datetime-local`，每次编辑保存都会二次偏移一个时区差（北京时间 +8h），连续编辑累计漂移 | 高（数据正确性） | 本轮修复 |
| 4 | 6 语言 i18n 缺口——权限模块标签缺 `memo`、无 `admin.projects` 整段 | 中 | 本轮补齐（每语言 3 处） |
| 5 | 活动管理列表无分页/搜索/筛选（当前 8 条数据可接受） | 低 | 记录为遗留债务 |
| 6 | 全站 confirm/alert 使用原生弹窗，与 SPEC 一.6「统一 Toast」有差距 | 低 | 记录为遗留债务 |

---

## 二、开发方案（已实施）

### 2.1 页面架构设计

```
/admin/projects            → 列表页（组合 ProjectsManager）
/admin/projects/new        → 新建页（组合 ProjectEditor，无 projectId）
/admin/projects/[id]/edit  → 编辑页（组合 ProjectEditor，id 数字守卫）
```

- 页面文件只做**组合与路由参数解析**，业务逻辑全部收敛在 `components/admin/projects/*`（对齐既有 blog 模式）。
- 侧边栏导航：权限驱动显隐（`modules: ["projects"]`），置于「站点内容管理」组 activities 之后。

### 2.2 核心功能模块规划

**ProjectsManager（列表）**：300ms 搜索防抖（回第一页）、状态筛选（published/draft/archived）、服务端分页（PAGE_SIZE=20）、行内操作（编辑/删除）、tech_stack 前 3 个 + "+N"、删除二次确认 + 绿色成功提示条。

**ProjectEditor（编辑器）**：Markdown 编辑器（@uiw/react-md-editor，dynamic ssr:false，data-color-mode 跟随暗色主题）+ 右侧元信息卡双栏布局（标题/slug 自动生成/description/year/leader/tech_stack 标签交互/github_url/demo_url/状态）；截图多图上传（复用 media API `adminUploadMedia(file, "cover")` → `/uploads/...` 经 next.config.ts rewrites 同源反代）；必填与区间校验（year 1900–3000）。

### 2.3 交互流程规范（复用既定模式）

- 服务端分页 + 防抖搜索；状态枚举化徽章（StatusBadge 色调映射）
- 危险操作 confirm 二次确认 → 操作后绿色提示条反馈
- `datetime-local` 时区铁律：回填 **UTC → 本地**（`utcToLocalInput`），提交 **本地 → UTC**（`new Date(v).toISOString()`）
- 错误提示走 i18n key（errTitleRequired / errContentRequired / errYearInvalid），6 语言全覆盖

### 2.4 UI 组件复用规则

仅复用既有基建，**零新依赖**：`ui/*` 基础组件、StatusBadge、FormattedUserActionTime、MDEditor、`lib/api/client.ts`（双壳解析 + CSRF 自动重试）、分页控件 key 与 admin.security 保持一致。

---

## 三、改动清单（5 新建 + 11 修改 = 16 文件）

**新建：**

| 文件 | 说明 |
|---|---|
| `frontend/components/admin/projects/ProjectsManager.tsx` | 项目列表管理组件 |
| `frontend/components/admin/projects/ProjectEditor.tsx` | 项目编辑器（MD + 元信息卡 + 截图上传） |
| `frontend/app/admin/(dashboard)/projects/page.tsx` | 列表页 |
| `frontend/app/admin/(dashboard)/projects/new/page.tsx` | 新建页 |
| `frontend/app/admin/(dashboard)/projects/[id]/edit/page.tsx` | 编辑页 |

**修改：**

| 文件 | 说明 |
|---|---|
| `frontend/lib/utils/index.ts` | 新增共享 `utcToLocalInput()`（UTC ISO → datetime-local 本地值） |
| `frontend/components/admin/activities/ActivityForm.tsx` | **时区 bug 修复**：4 个时间字段回填改用 `utcToLocalInput` |
| `frontend/components/admin/blog/BlogEditor.tsx` | 删除本地重复实现，改从 `@/lib/utils` 导入 |
| `frontend/lib/permissions.ts` | 补 `projects` 模块（22 模块）+ 三角色默认矩阵（对齐后端） |
| `frontend/app/admin/(dashboard)/layout.tsx` | 导航新增「项目管理」入口（FolderKanban，权限驱动） |
| `frontend/i18n/messages/*.json`（zh-cn / zh-tw / zh-hk / en-us / en-gb / ja） | 每语言 3 处：①导航标签 projects ②权限模块 projects + 补齐 memo ③新增完整 `admin.projects` 段（44 key） |

---

## 四、验证结果

### 4.1 静态与自动化检查

| 项 | 命令 | 结果 |
|---|---|---|
| TypeScript 全量类型检查 | `tsc --noEmit -p frontend` | **0 错误** |
| 后端测试套件 | `pytest`（venv） | **53 passed**，1 warning（starlette testclient httpx 弃用提示，非项目代码问题） |
| i18n JSON 合法性 | 解析校验 ×6 | **6 文件全部合法** |

### 4.2 浏览器端到端实测（8/8 PASS）

1. **登录后台**（用户名登录，管理员账号）
2. **侧边栏**出现「项目管理」入口（权限驱动渲染正确）
3. **列表页**：4 个种子项目、年份降序、状态徽章渲染正常
4. **新建页**：表单、Markdown 编辑器、元信息卡完整渲染
5. **创建**「浏览器测试项目」成功，跳回列表（5 条）
6. **编辑**：状态改为「已发布」并保存成功
7. **删除**：行内垃圾桶 → 原生 confirm → 列表即时移除（5→4）+ 绿色提示条「项目已删除」
8. **活动管理页**回归：正常加载（约 8 个活动），时区修复未破坏既有流程

### 4.3 后端审计日志核验

`audit_logs` 表确认三条审计落库（UTC 时间）：

- `project.create`、`project.update`、`project.delete`（target `project:5`）

### 4.4 测试数据与环境清理

- projects 表数量恢复为 4（种子数据原样）
- 临时管理员账号 `uitest` 及其 `login_sessions` 已删除
- 临时脚本 / cookie 文件已清理；仓库根**无**杂散 `assoc.db` / `.jwt_secret` / `initial_admin_password.txt`

---

## 五、遗留债务与后续建议

**P2（体验/一致性）：**

1. 全站 confirm/alert 原生弹窗 → 统一 Toast 化（SPEC 一.6 前端部分）
2. `adminUploadMedia` 仍按旧响应壳裸解析，待随旧壳迁移统一
3. 活动管理列表无分页/搜索/筛选（数据量小时可接受）

**SPEC 后续项目（按规范优先级）：**

| 优先级 | 项目 | 状态 |
|---|---|---|
| 立即落地 一.5/一.6 | 旧壳 HTTPException（中文 detail）→ BizException + 统一响应壳 + i18n key（register.py / activities.py 等大量旧模块） | **下一个执行** |
| 中期 12 | Alembic 数据库版本化迁移 | 待排期 |
| 中期 14 | GitHub Actions CI 门禁 | 待排期 |
| 中期 15 | Redis 缓存层（本机无 Redis 服务，受环境限制） | 待排期 |
| 一.4 | OpenAPI → 前端 TS 类型自动生成管道（受 pnpm 不可用阻塞，可先以零依赖脚本过渡） | 待排期 |
| — | gray-matter 死依赖清理（需 `pnpm remove` 同步 lockfile） | 受阻 |
