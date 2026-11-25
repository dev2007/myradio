import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlayerProvider } from "@/lib/player-context";
import { FavoritesProvider, HistoryProvider } from "@/lib/favorites-context";

export const metadata: Metadata = {
  title: "我的广播 · 全球电台收音机",
  description: "免费收听全球 6 万多个广播电台：音乐、新闻、脱口秀，打开就听。",
  applicationName: "我的广播",
  appleWebApp: {
    capable: true,
    title: "我的广播",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#1b202e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // cacheComponents 下 React 组件内不允许渲染内联 <script>，且 <html> 属于静态外壳，
  // 无法按请求读取 cookie 设置 data-theme。主题方案：
  // 首帧由 globals.css 的 prefers-color-scheme 媒体查询跟随系统；
  // 已保存的显式选择由 ThemeToggle 水合前（useLayoutEffect）应用。
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <FavoritesProvider>
          <HistoryProvider>
            <PlayerProvider>{children}</PlayerProvider>
          </HistoryProvider>
        </FavoritesProvider>
      </body>
    </html>
  );
}
