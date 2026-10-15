# 全局重构标准规范（执行层）

> **文档定位**：`docs/SPEC.md` 是本项目的产品 / 工程终极规范（唯一真值源）。本文档是它的**执行层配套**，只描述分阶段重构的施工规范：目录标准、阶段表、施工红线、验收清单。
> **冲突时以 `docs/SPEC.md` 为准**；本文档不得与 SPEC.md 矛盾。
>
> 本文件为活文档：每完成一个重构子阶段，回写该阶段的实际结论（清点结果、取舍决定、验证记录）。

---

## 一、重构总阶段表

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 阶段 1 | 修复阻断性报错，`npm run dev` 跑通，冒烟测试 | ✔ |
| 阶段 2 | 清理工程垃圾：死代码、无用 import、临时 console；eslint / prettier 开启导入排序 | — |
| 阶段 3 | **标准化基础** | — |
| ├ 3-1 | 抽全局常量 → `constants/` | — |
| ├ 3-2 | 抽公共 hooks → `hooks/` | — |
| ├ 3-3 | 抽公共工具函数 → `utils/` | — |
| ├ 3-4 | 抽全局共享 types → `types/` | — |
| └ **3-5** | **【新增】图标矢量化（SVG）**（放在 3-1~3-4 之后、阶段 4 之前执行） | — |
| 阶段 4 | 核对 `'use client'` 边界；抽重复 UI 公共组件；存量目录尽量不动 | — |
| 阶段 5 | 完整回归全量测试（**必须额外增加：图标专项校验**） | — |

> 阶段 3-5 的完整施工规范见第二章、可执行步骤见第三章。

---

## 二、图标资源标准（阶段 3-5）

### 2.1 目标与通用约束（叠加在原有重构约束之上）

1. 原有全部业务、UI、交互、路由、数据库**不变**。
2. **只替换图标资源来源**；最终视觉（尺寸、间距、颜色、hover、断点表现）必须与替换前**逐像素一致**。
3. 移除所有外部图标 CDN / 第三方图标包，全部改用本地 `.svg` 文件（内联组件形式消费）。
4. 阶段位置：在【抽常量 / 工具】之后、【组件整理】之前执行。

### 2.2 现状盘点（实测结论，2026-10-15）

| 项 | 实测结果 |
| --- | --- |
| 第三方图标库 | `lucide-react@^0.460.0`（`frontend/package.json`） |
| 引用图标库的文件数 | **143 个**（`.tsx` / `.ts`） |
| 不同图标名（去重） | **138 个**（含 1 个类型 `LucideIcon`，实际图标组件 **137 个**） |
| 内联硬编码 `<svg>` | **仅 1 处**：`frontend/components/home/EventsPreview.tsx`（装饰性波浪线，`viewBox="0 0 560 110"`） |
| png / jpg 位图图标 | **无**（仓库内 `.png/.ico` 均非图标资源，`public/` 仅 Next 默认示例 svg） |
| 其他第三方图标包 | `country-flag-icons@1.6.20`（`frontend/components/admin/stats/CountryFlag.tsx`，国旗集，按需动态加载） |
| 品牌 logo | `frontend/components/shared/BrandMark.tsx`（`>_` 方块 + `GDUECA` 字标，**纯 CSS/文本实现，非图片**） |
| 图标渲染方式 | 全部为 React 组件消费，调用点通过 `className`（如 `h-4 w-4` / `h-5 w-5`）控制尺寸 |
| strokeWidth 覆盖 | 调用点**无** `strokeWidth` / `absoluteStrokeWidth` 传参 → 全站统一 lucide 默认 `stroke-width=2` |

**存量图标清单（137 项，按建议分类，执行时以步骤①清点结果为准）**

- **navigation/**（导航、位移、层级、入口）：
  `menu` `chevron-down` `chevron-up` `chevron-left` `chevron-right` `arrow-left` `arrow-right` `arrow-up` `arrow-down` `arrow-up-right` `more-horizontal` `home` `external-link` `link-2` `log-in` `log-out` `layout-dashboard` `layout-grid` `settings` `folder-open` `folder-kanban` `history` `globe`
- **action/**（执行类动作）：
  `search` `plus` `x` `trash-2` `pencil` `refresh-cw` `rotate-ccw` `download` `upload` `copy` `send` `save` `share-2` `check` `check-check` `square` `square-check` `reply` `file-edit` `pen-line` `image-plus` `paperclip` `power` `power-off` `archive` `archive-restore` `wand-2` `hammer` `wrench` `calculator` `qr-code` `sliders-horizontal` `type`
- **status/**（状态、提示、反馈、安全、加载、主题、领域标记）：
  `loader-2` `check-circle-2` `x-circle` `alert-triangle` `info` `shield-alert` `shield-check` `shield-ban` `shield` `badge-check` `ban` `circle` `star` `bookmark` `heart` `heart-pulse` `sun` `moon` `palette` `sparkles` `bell` `bell-ring` `message-circle` `message-square` `bug` `timer` `clock` `lock` `lock-keyhole` `key-round` `eye` `eye-off` `fingerprint` `id-card` `mail` `mail-question` `mail-warning` `mail-plus` `cookie` `life-buoy` `ticket` `tag` `tags` `database` `hard-drive` `monitor` `monitor-smartphone` `laptop` `smartphone` `map-pin` `bar-chart-3` `calendar` `calendar-days` `calendar-check` `file-text` `newspaper` `scroll-text` `megaphone` `graduation-cap` `building-2` `briefcase` `wallet` `image` `image-icon`
- **user/**（用户、身份、账号、权限）：
  `user` `users` `user-circle` `user-round` `users-round` `user-plus` `user-cog` `user-x` `user-pen`
- **brand/**（品牌、logo、第三方平台标识）：
  `github` `apple` `chrome`（第三方平台标识，非商标复用，仅作登录渠道/技术栈标识）
- **类型（非图标）**：`LucideIcon` → 迁移为本地 `IconComponent` 类型（见 2.6）。

### 2.3 存放路径规范

本项目**没有 `src/` 目录**，前端根即 `frontend/`，故路径落点为 `frontend/assets/icons/`（`tsconfig.json` 已配 `"@/*": ["./*"]`，因此可用 `@/assets/icons/...` 引用）。

```
frontend/
└── assets/
    └── icons/
        ├── navigation/   # 导航类：菜单、展开收起、抽屉、位移箭头
        ├── action/       # 操作类：提交、复制、刷新、删除、编辑
        ├── status/       # 状态类：警告、成功、错误、信息、加载
        └── user/         # 用户类：用户、头像、个人主页
        └── brand/        # 品牌类：logo、第三方平台标识
```

- 所有图标均为**独立 `.svg` 文件**；**禁止把 `<svg>` 内嵌写死在 tsx 里**。
- **唯一特例**：极小的一次性私有图标允许留在组件内部，但必须加注释标记：
  `// @ICON-LOCAL 仅本组件私有图标，不抽全局`
  （现状中 `EventsPreview.tsx` 的装饰波浪线属于此类，保留原处并打标记。）

### 2.4 SVG 文件编写硬性标准

1. 去掉所有外部引用、`id`、无用注释、编辑器垃圾属性（Illustrator / Figma 导出残留、`<style>` 块、`xmlns:xlink`、空 `<g>` 等）。
2. **禁止硬编码 `fill` / `stroke` 颜色**，统一使用 `currentColor`（跟随父元素色，明暗主题自动适配）。
3. 统一基准 `viewBox="0 0 24 24"`；特殊尺寸图标保留原生 `viewBox` 并在文件头注释备注原因。
4. 文件名：**kebab-case**（短横线小写），如 `menu-open.svg`、`warning-alert.svg`、`user-profile.svg`。
   PascalCase 组件名 → kebab-case 文件名，规则：`Trash2` → `trash-2.svg`、`CheckCircle2` → `check-circle-2.svg`。
5. **视觉等价硬约束（最关键）**：为保证与 lucide 现有渲染逐像素一致，每个迁移出的 SVG 根节点必须复刻 lucide 默认几何：
   ```xml
   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
     <path d="..." />
   </svg>
   ```
   - `d`（路径数据）必须与 lucide 原图标**一模一样**，不得重绘、不得美化；
   - 不得增删 `stroke-width`、`stroke-linecap`、`stroke-linejoin`；
   - 不得改动图标内部坐标以「顺手优化」。

### 2.5 技术方案与配置

采用**内联 SVG 组件方案**（可完美继承 `currentColor`，颜色随父组件、适配明暗主题）。

#### 方案 A（首选）：`@svgr/webpack`

> ⚠️ **本项目为 Next.js 16.3.5，dev 与 build 默认使用 Turbopack**。
> 用户示例中的 `webpack(config) { ... push @svgr/webpack ... }` 写法在 Turbopack 下**不会生效**，必须改写为 `turbopack.rules`。

`frontend/next.config.ts` 中已存在空的 `turbopack: {}` 配置块，在其中补入规则（**不要**新增 `webpack()` 配置）：

```ts
const nextConfig: NextConfig = {
  // ...既有配置保持不变...
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};
```

配合 `tsconfig.json` 增加类型声明（`frontend/types/svg.d.ts` 或 `next-env.d.ts` 同级）：

```ts
declare module "*.svg" {
  import type { IconComponent } from "@/types/icons";
  const component: IconComponent;
  export default component;
}
```

> **依赖前置条件（当前阻塞）**：`@svgr/webpack` 未安装，且实测 `npm view @svgr/webpack` 返回 `ECONNRESET`（`registry.npmjs.org` 不可达）；本机 pnpm 亦无法联网拉取。
> 因此**方案 A 需等待网络恢复后**执行：`pnpm add -D @svgr/webpack`（须能同步更新 `pnpm-lock.yaml`）。

#### 方案 B（兜底，零新依赖，当前环境可直接执行）：构建脚本生成 `.tsx` 组件

在**不联网、不加依赖**的前提下，用本地 Node 脚本把 `assets/icons/**/*.svg` 机械转换为内联 React 组件：

- 脚本位置：`frontend/scripts/gen-icons.mjs`（构建期/手动执行，产物纳入版本库）。
- 产物位置：`frontend/components/icons/<category>/<Name>.tsx` + 桶文件 `frontend/components/icons/index.ts`。
- 转换规则：把 `<svg>` 转为 JSX（`stroke-width`→`strokeWidth` 等驼峰化），保留 `fill="none"` / `stroke="currentColor"` / `width={24}` / `height={24}` / `viewBox`，透传 `className` 等 props。
- 与方案 A **产出一致**（同为内联 SVG 组件、支持 `currentColor`、受编译期类型检查），故后续可平滑切换、替换面极小。

**两种方案的取舍记录**：

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| `public/assets/icons` + `next/image` | 最简单 | `img` 方式**无法继承 `currentColor`**，明暗主题需额外处理 → **不采用** |
| 内联导入（svgr / 脚本生成） | 完美支持 `currentColor`，跟随父组件 color，适配明暗主题，编译期检查 | 需配置（A）或维护脚本（B） |

### 2.6 统一调用约定

- 统一入口组件（保留用户指定的路径与形态）：`frontend/components/ui/icon.tsx`
  - 若走**方案 A/B 的内联组件**：`icon.tsx` 只做「尺寸/颜色默认值 + `className` 合并 + `aria-hidden` 语义」的薄封装，**不使用 `next/image`**（`Image` 无法继承 `currentColor`）。
  - 骨架示意：
    ```tsx
    "use client";
    import type { IconComponent } from "@/types/icons";
    import { cn } from "@/lib/utils";

    export function Icon({ icon: Glyph, size = 24, className }: {
      icon: IconComponent; size?: number; className?: string;
    }) {
      return <Glyph width={size} height={size} aria-hidden className={cn("inline-block shrink-0", className)} />;
    }
    ```
- 统一类型：`frontend/types/icons.ts`
  ```ts
  import type { ComponentType, SVGProps } from "react";
  export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
  ```
  `LucideIcon` 的所有引用改为 `IconComponent`。
- **尺寸沿用现有调用点写法**：继续使用 `className="h-4 w-4"` / `h-5 w-5` 等，不新增/不修改尺寸 props（CSS `width/height` 优先级高于 svg 的 `width/height` 属性，故与原 lucide 表现一致）。

### 2.7 迁移顺序与逐项视觉核对

**顺序**（严格）：① 导航菜单 → ② 抽屉 → ③ 设置页 → ④ 表单 → ⑤ 状态提示 → ⑥ 后台管理。

**每个图标替换后立即核对**（当场比对，不留到最后）：

1. **清点**：确认该图标在哪些文件被引用、各调用点的 `className`（尺寸 / 颜色 / margin）。
2. **替换**：改为本地 SVG（内联组件）引用，`d` 与默认几何原样复刻。
3. **校验**：
   - 尺寸一致（`h-4 w-4` 等实际渲染像素不变）；
   - 间距一致（外层 `gap` / `mr-*` / `shrink-0` 原样保留）；
   - 颜色一致（`text-muted-foreground` 等父级 `color` 生效，明暗两套主题下均正确）；
   - `hover` 状态一致（无肉眼可见差别）；
   - 放大浏览器图标**锐利无模糊**（矢量特性验证）。
4. 不允许因替换而出现的偏移、变形、粗细变化、留白变化。

### 2.8 红线禁令（叠加原有重构禁令）

1. ❌ **禁止借图标替换顺便改动图标造型**；形状必须与原图标一模一样，只换资源来源。
2. ❌ **禁止随便改图标大小、margin / padding**；原有布局间距原样保留。
3. ❌ **禁止把一次性局部图标强制挪进全局 `assets/icons`**；允许留在组件内并打 `// @ICON-LOCAL` 标记。
4. ❌ **SVG 禁止硬编码 `fill` / `stroke` 颜色**；统一 `currentColor` 以适配明暗主题。

### 2.9 图标专项回归清单（并入阶段 5）

- [ ] 全部 UI 图标已矢量化；**无外部 CDN 图标**；代码中**不再 import `lucide-react`**（依赖包移除视联网情况单独执行）。
- [ ] 深色 / 浅色主题切换时，所有图标颜色跟随主题（`currentColor` 生效）。
- [ ] 所有图标尺寸、间距、hover 效果与重构前**完全一样**，无偏移、无变形。
- [ ] 放大浏览器倍数，图标保持锐利无模糊（矢量特性验证）。
- [ ] 移动端、桌面端各断点图标表现一致。

---

## 三、阶段 3-5 可执行实施步骤

> 前置：阶段 3-1~3-4（常量 / hooks / 工具 / types）已完成。

1. **① 建立目录与清点**
   - 新建 `frontend/assets/icons/{navigation,action,status,user,brand}/`；
   - 按 2.2 清单逐个清点（遍历 `frontend/` 下全部 `.tsx/.ts`，排除 `node_modules`、`.next`），产出「图标名 → 引用文件 → 调用点 className」台账，写回本文档 2.2。
2. **② 打通工具链（二选一，见 2.5）**
   - 首选：联网后 `pnpm add -D @svgr/webpack` + 配置 `turbopack.rules`（**禁用 `webpack()` 写法**）+ 加 `*.svg` 类型声明；
   - 兜底：落地 `frontend/scripts/gen-icons.mjs` 生成脚本（零依赖，当前环境可立即执行）。
3. **③ 归一化调用入口**
   - 建 `frontend/types/icons.ts`（`IconComponent`）；
   - 建 / 改造 `frontend/components/ui/icon.tsx`（薄封装，不用 `next/image`）；
   - 把 `LucideIcon` 引用全部替换为 `IconComponent`。
4. **④ 生成 / 落地 SVG 资源**
   - 按 2.4 标准落地 137 个 SVG（`currentColor`、`viewBox 0 0 24 24`、`d` 原样复刻、kebab-case 命名）；
   - `assets/icons` 落点见 2.3。
5. **⑤ 按序替换导入并逐项核对**
   - 顺序见 2.7；每项替换后立即执行「尺寸 / 间距 / 颜色 / hover」四项核对（必须当场比对）。
6. **⑥ 清理内联 SVG**
   - `EventsPreview.tsx` 装饰波浪线：保留原处（属 `@ICON-LOCAL`），补标记注释；
   - 全库 `grep "<svg"` 复核，确认无遗漏硬编码图标。
7. **⑦ 第三方包与依赖清理（视联网情况）**
   - 代码层：确认全库无 `from "lucide-react"` 引用后，`pnpm remove lucide-react`（**须能同步 `pnpm-lock.yaml`；联网不可用时此步挂起**，保持依赖安装不影响运行）；
   - `country-flag-icons`：**待确认项**——国旗集属内容 / 数据资源（已是 SVG、按需动态加载），非 UI 图标，默认**不纳入**本阶段；若要移除需单独立项评估（200+ 国旗文件）。
8. **⑧ 阶段验收**
   - `tsc --noEmit` 零错误；
   - 执行 2.9 图标专项清单全项；
   - 回写本文档 2.2 的实际清点与取舍结论。

---

## 四、更新记录

| 日期 | 变更 |
| --- | --- |
| 2026-10-15 | 初版：新增阶段 3-5「图标矢量化」；建立【图标资源标准】章节（路径、命名、SVG 标准、Turbopack/svgr 配置、`currentColor` 规则、迁移顺序、红线、回归清单、可执行步骤）；记录实测盘点与两项待确认项（npm 不可达 → 兜底方案 B；`country-flag-icons` 是否纳入）。 |
