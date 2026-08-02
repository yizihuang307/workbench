---
version: "1.0"
name: Personal Workbench — Violet Energy
description: 面向互联网工作者的年轻、现代、高密度个人工作台；以紫色为主、琥珀黄作小面积强调，白底与轻毛玻璃提供清爽层次。
colors:
  primary: "#5b5bd6"
  primary-hover: "#5151cd"
  primary-strong: "#272962"
  primary-soft: "#f0f0ff"
  primary-border: "#d1d1fa"
  accent: "#ffc53d"
  accent-soft: "#fff7c2"
  info: "#0090ff"
  surface: "#ffffff"
  surface-glass: "#ffffffe0"
  on-surface: "#202020"
  muted: "#646464"
  border: "#2020201a"
  error: "#d13415"
  success: "#30a46c"
typography:
  display:
    fontFamily: Geist Sans
    fontSize: 34px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Geist Sans
    fontSize: 28px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Geist Sans
    fontSize: 20px
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Geist Sans
    fontSize: 17px
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0em
  body-md:
    fontFamily: Geist Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  label-md:
    fontFamily: Geist Sans
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0em
  caption:
    fontFamily: Geist Sans
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.01em
rounded:
  none: 0px
  xs: 7px
  sm: 9px
  md: 12px
  lg: 18px
  xl: 20px
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  page-gutter-desktop: 24px
  page-gutter-mobile: 12px
  page-max-width: 1200px
  control-compact: 36px
  control-default: 40px
  touch-target: 44px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-compact}"
    padding: 14px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-compact}"
    padding: 14px
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.primary-strong}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-compact}"
    padding: 10px
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-compact}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-default}"
    padding: 11px
  tab:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-compact}"
    padding: 11px
  tab-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
  tab-marker:
    backgroundColor: "{colors.info}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    size: 8px
  card-glass:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  board-column:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    width: 304px
    padding: 12px
  board-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 12px
  modal:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: 24px
  focus-ring:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
---

# Personal Workbench — Violet Energy

## Overview

这是一套为互联网工作者设计的轻快型生产力界面：年轻、现代、有活力，但不做娱乐化或“糖果感”设计。视觉以白色画布和紫色主轴建立识别度，琥珀黄只承担小面积提醒、选中和情绪点缀；重要的大区域保持浅紫同色系，避免大面积撞色造成疲劳。

界面优先服务高频录入和长时间阅读，因此采用“内容区安静、导航和主操作有能量”的分配方式。毛玻璃只用于侧栏、浮层、菜单和卡片表面，渐变只用于导航背景、主按钮及环境光晕。焦点卡片不得使用渐变。

视觉来源：用户确认的紫色主调、琥珀黄小色块、白底、轻渐变、毛玻璃、Emoji 导航，以及当前线上工作台与用户提供的组件截图。本文件记录当前已确认方案，并覆盖拆分后的【链接】与【资料】页面，不另造新的视觉方向。

## Colors

- `primary` 紫色是品牌和主操作色，用于侧栏、主按钮、激活标签、选中指示和焦点环。
- `primary-soft` 与 `primary-border` 用于重要大区域、悬停、输入边框和选中卡片；大面积区域优先使用浅紫同色系，不使用琥珀黄铺底。
- `accent` 琥珀黄只用于小标签、心情选中、关键词高亮、撤销操作和少量进度点缀；同一视口内不超过约 10% 的可见面积。
- `surface` 为纯白页面和实体控件；`surface-glass` 为约 88% 白色浮层。正文采用 `on-surface`，辅助文字采用 `muted`。
- `error` 只用于删除、失败和高风险提示；`success` 只用于完成与保存成功。
- 主按钮允许 `#5b5bd6 → #796ae3` 的短距离紫色渐变。页面环境光晕允许低透明浅紫与琥珀，但不得影响文字对比度。

## Typography

全站使用 Geist Sans，中文依次回退到 PingFang SC、Microsoft YaHei 和系统无衬线字体。标题主要使用 650 字重，正文使用 400，标签使用 600；避免 800–900 的大面积粗黑字造成旧式海报感。

- 页面标题：25–34px 自适应，桌面上限 34px。
- 弹窗标题：20px；快速记录这类主任务弹窗可使用 28px。
- 卡片标题：17px；工具栏标题 18px。
- 正文：14–16px；按钮和标签：13px；说明与计数：11–12px。
- 大标题使用略紧字距，正文与控件不压缩字距。中文按钮文案保持完整，不使用全大写英文充当主要信息。

## Layout

桌面内容最大宽度 1200px，左右各保留至少 24px；移动端页边距 12px。基础间距为 4px，常用组合为 8 / 12 / 16 / 24 / 32px。

- 桌面侧栏宽 188px；中等屏幕压缩到 76px；640px 以下变为底部导航。
- 同一工具条内控件间距 6–8px；卡片之间 16px；弹窗正文区内边距 24px。
- 高密度工作区使用 36px 紧凑按钮和标签，40px 输入框；普通主操作可使用 40px。移动端所有主要触控目标不得小于 44px。
- 输入框比相邻按钮高 4px 是有意设置：输入承担持续操作，按钮是短促动作；两者按中心线对齐，而非强行等高。
- 页面只保留一个清晰的主层级；不要给每个小模块都增加独立的大标题、重阴影或宽大留白。
- 【链接】页使用“工具栏＋分组标签＋内容区”。列表模式优先展示长名称；网格模式作为可切换偏好。
- 【资料】页使用横向分类看板。桌面列宽固定在 288–320px，默认 304px；分类横向滚动，列内卡片独立纵向滚动，列头固定。
- 资料新增按钮固定在每列列头右侧，不随卡片列表滚动，也不放在列底。

## Elevation & Depth

页面以白底为零层；内容卡片为轻玻璃一层；菜单、弹窗和提示为浮层。层级主要依靠透明白表面、1px 低对比边框、18–22px 模糊和柔和紫灰阴影表达。

- 常规面板阴影：`0 12px 34px rgba(39,41,98,.07)`。
- 浮层阴影：`0 18px 55px rgba(39,41,98,.16)`；大弹窗可提高到 `0 28px 80px rgba(26,24,68,.25)`。
- 不使用硬偏移阴影、黑色粗描边或多层彩色阴影。
- 毛玻璃必须有接近白色的实体后备背景和细边框；不要单靠 blur 区分层级。

## Shapes

形状使用精致的中等圆角，不采用过度胶囊化。

- 小标签和菜单项 7px；按钮、输入与分类标签 9px；导航和一般控件 10–12px。
- 主卡片 18px；弹窗 20px；移动端底部浮动导航 18px。
- 只有进度条、圆形状态与头像类元素使用 `full`；普通文本按钮禁止做成超长胶囊。
- 同组组件必须使用同一圆角档位。输入框与相邻动作按钮可以同为 9px，即使高度不同。

## Components

- **主按钮**：桌面高 36px，13px/600，左右内边距 14px，9px 圆角；紫色短渐变只用于主操作。hover 加深，active 下移 1px，disabled 保持结构但降低透明度。
- **次按钮**：白底、深色文字、1px 中性边框；不可与主按钮拥有相同视觉重量。
- **轻量文字按钮**：透明底、深紫文字，桌面高 36px；hover 和展开态使用浅紫底。适用于排序、视图设置和低频管理，不使用渐变或紫色实底。
- **危险按钮**：默认白底红字，只有最终确认且风险明确时才允许红色实底。
- **输入框**：桌面高 40px，14px 正文，11px 左右内边距；focus 使用紫色边框和低透明紫色焦点环。长文本编辑区按内容任务确定高度，不套用 40px。
- **分类标签 / Tab**：桌面高 36px，13px；激活态紫底白字，数量用 9–11px 且降低强调。标签之间 6px，不使用大块留白。
- **Tab 色标圆点**：分类与筛选 Tab 的文字前放置 8px 彩色圆点，固定使用蓝、绿、琥珀、番茄红、浅紫的循环色序。圆点只帮助快速辨认分类，不代表状态；激活态仍由紫底白字表达，并给圆点增加细白环保证可见。管理、设置、删除等动作按钮不加圆点。
- **图标按钮**：视觉盒可为 32–36px；若桌面是高密度列表，可视图形较小，但可点击区域应尽量保持 40–44px。移动端统一至少 44px。
- **卡片**：18px 圆角、轻玻璃白、低对比边框。重点卡片使用浅紫同色系纯色或透明色调，不使用渐变。
- **链接条目**：列表默认单行排列 Logo、名称、域名和操作；名称空间优先，超长单行省略并提供全文提示。网格保持紧凑，不做一链接一张大卡片。
- **资料看板列**：浅紫表面、18px 圆角、12px 内边距；列头显示分类名、数量、固定新增按钮和更多菜单，滚动时保持可见。
- **资料卡片**：白底、12px 圆角、12px 内边距、低对比边框；标题最多两行，摘要一行。选中、拖拽和置顶只增加轻边框或小标记。
- **排序入口**：位于页面顶部工具栏，采用“排序：手动⌄”轻量文字按钮；不得出现在每一列，也不得使用紫色主按钮造型。
- **搜索高亮**：匹配文字使用 `accent-soft` 背景和正文色，圆角 3px；不改变字号和行高。
- **弹窗**：20px 圆角、24px 内边距；常规标题 20px。关闭按钮 32–36px，位于右上；主要动作放在右侧，按钮高 36px。移动端弹窗贴底，操作高 44px。
- **导航**：使用 Emoji 代替常规线性图标；Emoji 尺寸约 15–16px，保持自然色彩但适度降低饱和度。激活项为近白底深紫字。
- **菜单与浮层**：12px 圆角、18px 毛玻璃、轻阴影；菜单项约 40px 高，危险操作红字。
- **反馈状态**：loading 使用浅紫骨架；empty 使用简短文案和一个可选主行动；error 使用错误色和重试按钮；forbidden 使用克制的锁定说明，不新增大面积深色页面。

## Do's and Don'ts

- **Do** 用紫色建立品牌识别，用浅紫组织大区域，用琥珀黄做小面积高亮。
- **Do** 在分类与筛选 Tab 前使用 8px 固定色序圆点增加页面活力；同一分类在同一列表中保持颜色稳定。
- **Do** 保持桌面高密度：按钮和 Tab 36px，输入 40px；移动端回到 44px 触控尺寸。
- **Do** 让渐变集中在主按钮、侧栏和背景光晕；焦点内容卡片使用纯色浅紫。
- **Do** 让卡片、弹窗、按钮分别使用 18px、20px、9px 的清晰圆角层级。
- **Do** 新组件优先复用本文已有颜色、字号、间距和组件原子；确需新增 token 时先更新本文。
- **Do** 将资料排序放在顶部工具栏，用轻量文字菜单表达全局设置。
- **Do** 固定资料列头及其新增按钮，让长列表中随时可以创建资料。
- **Don't** 用琥珀黄作为大卡片或大面积重要区域背景。
- **Don't** 给纯操作按钮添加分类圆点，也不要让圆点替代文字、选中态或真实状态提示。
- **Don't** 把所有按钮都做成紫色实底或渐变；每个局部只保留一个最强主操作。
- **Don't** 使用 44px 以上的桌面普通按钮，也不要把 36px 规则错误套到移动端。
- **Don't** 同一组控件混用 8、12、16px 等多个相近圆角；优先落到既定档位。
- **Don't** 叠加重边框、重阴影和毛玻璃三种效果；层级表达最多选择其中两种。
- **Don't** 在未更新本文件的情况下引入新主色、新字体、全新的按钮造型或另一套间距节奏。
- **Don't** 为资料排序使用紫色实底大按钮，也不要在每个分类列重复放置全局排序入口。
- **Don't** 把资料新增入口放在长列表底部，或让新增入口随卡片滚出视口。

> 覆盖范围说明：本版已对齐现有【安排】【记录】和拆分后的【链接】【资料】视觉规则；两页交互以 `docs/links-resources-interaction.md` 为准。现有资料编辑详情沿用 `docs/interaction.md`，本轮不修改。“心情”完整页面尚未冻结。由于尚无对应 `architecture.md` 与页面原型清单，本文件是可评审的视觉规范稿；进入开发前仍需做技术与原型交叉校验。
