# i18n 文本翻译、术语与开发规范（V0.6.1 需求2）

> 适用范围：GDUCA 计算机协会官网全部界面文案、后端返回的多语言内容。
> 本文档是全站翻译工作的唯一规范依据，供社团换届后的后续维护者直接沿用。
> 关联实现：`frontend/lib/i18n.ts`（语种白名单与回退链）、`frontend/i18n/merge.ts`（兜底合并）、`frontend/i18n/provider.tsx`（缺 key 降级）、`backend/app/core/locales.py`（后端白名单）、`frontend/scripts/check-i18n-keys.mjs`（key 一致性校验）。

---

## 1. 语种白名单（锁定，禁止新增）

全站 UI 界面语言严格锁定以下 **13 门**（前后端一致，新增语言需先修订本规范）：

| # | locale（URL 小写） | 语言 | 基准角色 |
|---|---|---|---|
| 1 | `zh-cn` | 简体中文（中国大陆） | **第一基准**（key 基准、校验基准） |
| 2 | `zh-hk` | 繁體中文（香港） | 变体基准 |
| 3 | `zh-mo` | 繁體中文（澳門） | 缺词条回退 `zh-hk` |
| 4 | `zh-tw` | 繁體中文（台灣） | 变体基准 |
| 5 | `ja-jp` | 日本語 | — |
| 6 | `ko-kr` | 한국어 | — |
| 7 | `en-gb` | British English | **第二基准**（英文基准，独立维护） |
| 8 | `en-us` | American English | 缺词条回退 `en-gb` |
| 9 | `es-es` | Español | — |
| 10 | `fr-fr` | Français | — |
| 11 | `de-de` | Deutsch | — |
| 12 | `pt-pt` | Português | — |
| 13 | `it-it` | Italiano | — |

- 单一来源：前端 `lib/i18n.ts` 的 `LOCALE_LIST`（顺序与下拉菜单标签即规格定稿）；后端 `app/core/locales.py` 的 `SUPPORTED_LOCALES`。两处必须同步修改。
- 语言文件位于 `frontend/i18n/messages/{locale}.json`，文件名与 locale 一致；新增/删除文件后重启 dev 自动更新路由白名单。
- **本版本不支持 RTL**（13 语种均为 LTR）；未来引入 ar/he/fa 等语言时需同步 `<html dir="rtl">` 并复核样式镜像。

---

## 2. 专有名词强制翻译规则（全站所有语种统一遵守）

### 2.1 开源项目、软件、技术框架名称：保留原始英文原名，不做翻译

示例（不限于此）：Alist、Cloudflare、Next.js、FastAPI、PostgreSQL、Redis、JWT、Docker、Linux、Git、Tailwind CSS、shadcn/ui、Nginx、systemd。

```text
✅ 正确（zh-cn）：使用 Cloudflare CDN 加速静态资源。
❌ 错误（zh-cn）：使用云flare CDN 加速静态资源。
```

### 2.2 厂商云服务名称：跟随厂商官方多语言命名

| 语言 | 示例写法 |
|---|---|
| zh-cn / zh-hk / zh-tw | 腾讯云 / 騰訊雲 / 騰訊雲 |
| en-gb / en-us | Tencent Cloud |
| ja-jp | Tencent Cloud（官方未出日文名时保留英文） |

同理：阿里云 / Alibaba Cloud、华为云 / Huawei Cloud。不确定时以厂商官网对应语言页面为准。

### 2.3 行文风格

- 网站定位为**高校科技社团**：行文严谨简洁，使用**技术文档风格**。
- 禁止网络口语、萌系娱乐化文案（如「小伙伴们」「冲鸭」「绝绝子」等一律不得出现）。
- 界面文案优先使用动词开头的短句或名词短语，控制在一行以内；说明文字不超过三行。

---

## 3. 英式英语 en-GB / 美式英语 en-US 区分规范

两份英文文件**独立编写维护**（`en-gb.json` / `en-us.json`），**禁止直接复制共用文本**。

### 3.1 拼写对照（高频词速查）

| 词义 | en-GB（英式） | en-US（美式） |
|---|---|---|
| 颜色 | colour | color |
| 行为 | behaviour | behavior |
| 组织 | organisation | organization |
| 中心 | centre | center |
| 米 | metre | meter |
| 最爱 | favourite | favorite |
| 数学 | maths | math |
| 项目/程序 | programme | program |
| 许可 | licence | license |
| 分析 | analyse | analyze |

### 3.2 语法与时态

- **en-GB**：常用现在完成时表达recent动作。例：*The event has finished — thank you for joining.*
- **en-US**：常用一般过去时。例：*The event finished — thanks for joining.*
- 日期格式随语言环境由代码格式化（`Intl.DateTimeFormat`），文案中不要硬写日期格式。

### 3.3 术语一致性

同一概念在两份英文文件中允许拼写/时态差异，但**术语本身必须同义**（如「注册」统一 registration/sign-up 体系内各自一致，不得一处 sign-up 一处 enroll）。

---

## 4. i18n Key 命名规范

### 4.1 格式

```
小写英文 + 点分隔，按「模块.页面.字段」分层
```

| 正例 | 说明 |
|---|---|
| `hero.main_title` | Hero 区块主标题 |
| `user_dropdown.profile_page` | 头像下拉菜单-个人主页 |
| `report.modal.title` | 举报弹窗标题 |
| `announcement.no_data` | 公告空状态占位 |
| `admin.reportAudit.statuses.pending` | 后台举报审核状态（允许四级，仍遵循分层语义） |

### 4.2 禁止

- ❌ 中文 key（`"导航.首页": "..."`）
- ❌ 无意义随机字符串 key（`"btn1"`、`"a8f3"`）
- ❌ key 内混用大写或下划线分隔层级（`nav_Home`、`Nav.home`）；仅字段名内部可保留下划线（`main_title`）
- ❌ 同一文案在多处重复定义（应收敛到公共模块，如 `common.save`）

### 4.3 仓储形式

- 语言 JSON 内**扁平点号 key 与嵌套结构等价**（`merge.ts` 的 `expandFlatKeys` 统一展开），两种写法可混用，但同一文件内风格保持一致。
- 变量占位符统一 `{name}` 花括号形式（`t("admin.reportAudit.total", { total })`）。

---

## 5. 文案兜底策略（防页面空白）

### 5.1 场景一：key 存在，但当前语种该字段为空字符串

**沿回退链自动降级**，任一层命中非空文案即渲染：

```
自身语言 → 变体父语言（zh-mo→zh-hk、en-us→en-gb）→ 分组终态语言
```

- 东亚语种（zh/ja/ko）终态回退 **zh-cn**；
- 欧美/拉丁系语种终态回退 **en-gb**。

> 实现说明：V0.6.1 定稿要求「回退 zh-CN」，实现细化为**双基准分组回退**——zh-cn 为第一基准（东亚语种终态、全站 key/校验基准），en-gb 为英文基准（欧美语种终态）。欧美访客空词条时看到英文兜底而非中文，避免语言突兀；两种路径均保证最终落在一份**完整维护的基准语言**上，不会空白。该细化由 merge 链架构决定，换届维护时保持一致。

- 空字符串在加载时即被剔除（`merge.ts` 的 `stripEmptyLeaves`），留空的翻译 key 不进最终字典；
- 后端动态内容（Hero 等）同构：`hero.py` 的 `_candidates` 链 = 自身 → 变体 → zh-cn → en-gb。

### 5.2 场景二：i18n key 不存在

| 环境 | 行为 |
|---|---|
| 开发环境（`npm run dev`） | 浏览器控制台告警一次：`[i18n] 缺失翻译 key：xxx`（每 key 每会话仅一次，`provider.tsx` 的 `warnMissingKey`） |
| 生产环境 | 静默，**原样输出 key 名**（不空白、不报错、不暴露堆栈） |

### 5.3 key 一致性校验

`frontend/scripts/check-i18n-keys.mjs` 以 `zh-cn.json` 为基准扫描全部语言文件，key 集合不一致（缺失/多余）时输出构建警告（不中断构建）。非基准语言未同步骨架时，缺失 key 在运行时由回退链兜底到基准文案，行为正确；该脚本同时充当**待翻译清单**——翻译填充前先跑一遍，按警告中的缺失 key 清单逐语言补齐。

---

## 6. 翻译填充工作流（当前阶段约定）

1. **骨架先行、翻译延后**：新功能先在 `zh-cn` 与 `en-gb` 两份基准文件补齐 key；其余 11 语种允许延后（缺失/空串均触发回退，页面不空白）。
2. **基准优先**：zh-cn 为第一基准、en-gb 为英文基准（英式拼写规范见 §3），其余语种随后按 §5.3 的脚本清单补齐。
3. **后端动态内容**（公告/Hero 等多语言字段）：13 语种结构必须完整建模，现阶段仅填充 zh-cn / en-gb；空语种由前端回退链渲染基准文案。
4. 新增 key 后执行：`node scripts/check-i18n-keys.mjs`（cwd = frontend）核对缺失清单。

---

## 7. 变更检查清单（提交前自查）

- [ ] 新 key 符合「模块.页面.字段」小写点分命名，无中文/随机 key
- [ ] zh-cn 与 en-gb 同步补齐；en-gb 为英式拼写，与 en-us 无混用
- [ ] 专有名词保留英文原名；厂商名用官方多语言命名
- [ ] `check-i18n-keys.mjs` 无**新增类别**的警告（缺失 key 属翻译延后范畴，多余 key 必须清理）
- [ ] 未在文案中硬编码日期/数字格式（交给 Intl 格式化）
- [ ] 未新增 RTL 假设的样式（负 margin 方向、左右箭头图标等）
