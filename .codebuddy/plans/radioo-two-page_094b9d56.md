---
name: radioo-two-page
overview: 将 Radioo Web 从单页重构为双页滑动结构：首页为现代圆形播放器（大 Logo 光环 + 当前频道名 + 收藏列表 + 浏览入口），第二页为现有全部频道浏览页（加心形收藏），移动端左右滑动切换、点播放自动回首页，收藏存 localStorage。
design:
  architecture:
    framework: react
  styleKeywords:
    - 现代简洁
    - 双主题
    - 圆形播放器
    - 微动效
    - 卡片化
  fontSystem:
    fontFamily: Inter, PingFang SC
    heading:
      size: 24px
      weight: 700
    subheading:
      size: 16px
      weight: 600
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#4F46E5"
      - "#0891B2"
      - "#818CF8"
      - "#22D3EE"
    background:
      - "#F4F5F8"
      - "#FFFFFF"
      - "#1B202E"
      - "#252B3C"
    text:
      - "#1E2433"
      - "#5B6472"
      - "#F1F5F9"
    functional:
      - "#059669"
      - "#DC2626"
      - "#D97706"
todos:
  - id: favorites-context
    content: 实现 favorites-context：localStorage 持久化、toggleFavorite/isFavorite/favorites，供首页与卡片共用
    status: completed
  - id: station-card-fav
    content: 重构 StationCard 结构（div+覆盖播放按钮）并新增右上角心形收藏按钮（aria-pressed、≥44px）
    status: completed
    dependencies:
      - favorites-context
  - id: radio-home
    content: 实现 RadioHome 首页：圆形 Logo 渐变光环播放器、当前频道信息、收藏列表、浏览入口按钮，参照 [skill:refactoring-ui]
    status: completed
    dependencies:
      - favorites-context
  - id: app-shell-swipe
    content: 实现 AppShell 双页滑动轨道 + 移动端 touch 手势 + 页指示点，BrowsePage 返回按钮与播放后自动回首页，page.tsx 接入
    status: completed
    dependencies:
      - radio-home
  - id: ui-review-verify
    content: 用 [skill:web-design-guidelines] 审查修复，验证 tsc/ESLint 通过、首页 200、滑动切页/收藏/自动返回链路可用
    status: completed
    dependencies:
      - app-shell-swipe
---

## 产品概述

重构 Radioo Web 首页播放器主体：将现有小图标圆形播放器替换为**大型复古拟物收音机整机图案**（SVG 插画），作为首页视觉核心，营造“打开收音机”的原生质感。

## 核心功能

- **大型复古收音机图案**（页面主体，宽约 320px）：
- 机身圆角矩形面板 + 左上可摆动天线
- 顶部刻度盘显示屏：内嵌当前电台 Logo（favicon 或首字母渐变占位）+ 调频刻度线 + 红色指针（按电台稳定映射伪频率）
- 中部喇叭格栅条纹，播放时数条竖向均衡器律动
- 右侧双旋钮（播放中音量旋钮缓慢旋转）+ LED 指示灯（播放时亮起带光晕）
- **播放状态联动**：idle/loading/playing/paused/error 各状态在图案上可见区分（指示灯、均衡器、天线摆动）
- 频道名/地区/状态文案、大播放按钮、收藏列表、浏览入口保持现有结构不变
- 双主题适配（浅色/深色 token）+ prefers-reduced-motion 全部动效降级

## 视觉效果

怀旧拟物质感：暖色机箱面板、格栅阴影层次、发亮指示灯；播放时整台收音机“活”起来（天线微摆、格栅律动、旋钮缓转、灯亮），静止时是一台安静的复古收音机。

## 技术方案

- **实现方式**：新建 `RetroRadio.tsx` 纯 SVG 组件（viewBox ≈ 340×240），props 传入 station/isPlaying/isLoading；颜色全部引用既有 CSS 主题变量（`var(--color-*)`），浅色暖木色面板、深色深面板
- **动效**：globals.css 追加 4 组 keyframes——天线 sway（transform-origin 根部）、格栅均衡器 scaleY（扩展 eq-bar）、旋钮缓转、LED 闪烁光晕；全部被现有 `prefers-reduced-motion` 全局降级规则覆盖
- **指针映射**：电台名简单 hash → 88–108 伪频率，保证同一电台指针位置稳定
- **集成**：RadioHome 用 RetroRadio 替换圆形 halo 主体（删除 StationAvatar 大图与 halo 逻辑），其余部分不动
- **合规**：禁 transition-all、显式 transition 属性、无障碍（图形 aria-hidden 装饰、状态文案 role=status/alert）

## 设计风格

复古拟物收音机 + 现代深浅双主题外壳：机身用暖色渐变面板（浅色主题米黄木纹感/深色主题深灰面板），喇叭格栅与刻度盘用内阴影层次表达凹陷，指示灯/指针用高饱和点缀色。下方信息区维持现有三级文字层次。

## Agent Extensions

### Skill

- **refactoring-ui**
- Purpose: 收音机图案与信息区的视觉层次、间距刻度、阴影深度设计参照
- Expected outcome: 图案与文案层次清晰、符合受限设计刻度
- **web-design-guidelines**
- Purpose: 改造完成后对 UI 代码做 Web Interface Guidelines 合规审查
- Expected outcome: 按 file:line 输出违规项并修复（aria、focus-visible、reduced-motion、触摸热区）