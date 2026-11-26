"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/lib/player-context";
import { EqualizerBars } from "./StationCard";
import { shareStation } from "@/lib/share";
import { toast } from "@/lib/toast";

interface NowPlayingBarProps {
  /** 点击条身回到收音机页 */
  onGoHome: () => void;
}

type PipWindow = Window & { document: Document };

interface DocumentPictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

/** 浏览页底部的正在播放栏：台名 + 播放状态 + 快捷播放/暂停 + 画中画 + 回到收音机 */
export function NowPlayingBar({ onGoHome }: NowPlayingBarProps) {
  const { current, state, toggle } = usePlayer();
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [pipWindow, setPipWindow] = useState<PipWindow | null>(null);

  /** 打开画中画小窗：拷贝样式表与主题类，让小窗拿到全部主题 token 与工具类 */
  const openPip = useCallback(async () => {
    const dpiP = (
      window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }
    ).documentPictureInPicture;
    if (!dpiP) return;
    try {
      const win = await dpiP.requestWindow({ width: 360, height: 220 });
      for (const sheet of document.styleSheets) {
        try {
          const css = Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("\n");
          const style = win.document.createElement("style");
          style.textContent = css;
          win.document.head.appendChild(style);
        } catch {
          // 跨域样式表无法读取规则，跳过
        }
      }
      // 同步主题类（深浅色）与基础底色
      win.document.documentElement.className = document.documentElement.className;
      win.document.body.className = "bg-background";
      win.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(win as PipWindow);
    } catch {
      // 用户关闭选择器或不支持时静默
    }
  }, []);

  const closePip = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  // 首页不需要（有收音机主体），无播放记录也不显示
  if (!current) return null;

  const isPlaying = state === "playing";
  const isLoading = state === "loading";
  const isError = state === "error";

  const statusText = isError
    ? "播放失败"
    : isLoading
      ? "正在连接…"
      : isPlaying
        ? "正在播放"
        : "已暂停";

  const dotClass = isError
    ? "bg-danger"
    : isLoading
      ? "bg-amber-500 animate-pulse"
      : isPlaying
        ? "bg-success animate-pulse"
        : "bg-text-muted/50";

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:px-6">
        {/* 条身：回到收音机页 */}
        <button
          type="button"
          onClick={onGoHome}
          aria-label={`回到收音机页，当前 ${statusText} ${current.name}`}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {current.favicon && !faviconFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/favicon?url=${encodeURIComponent(current.favicon)}`}
              alt=""
              width={36}
              height={36}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFaviconFailed(true)}
              className="h-9 w-9 shrink-0 rounded-lg bg-surface-2 object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 text-sm font-bold text-text"
            >
              {current.name.slice(0, 1).toUpperCase()}
            </span>
          )}

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-text">{current.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
              {statusText}
              {isPlaying && <EqualizerBars />}
            </span>
          </span>
        </button>

        {/* 播放/暂停：不打断浏览 */}
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? `暂停 ${current.name}` : `播放 ${current.name}`}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-surface text-primary transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {isPlaying ? (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11a1 1 0 0 0 1.53.85l8.6-5.5a1 1 0 0 0 0-1.7l-8.6-5.5A1 1 0 0 0 4 2.5z" />
            </svg>
          )}
        </button>

        {/* 分享：优先系统分享面板，否则复制链接 */}
        <button
          type="button"
          onClick={() =>
            void shareStation(current).then((result) => {
              if (result === "copied") toast("链接已复制，发给朋友即可收听");
              else if (result === "failed") toast("复制失败，请手动复制链接");
            })
          }
          aria-label={`分享 ${current.name}`}
          title="分享电台"
          className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary/40 hover:text-text min-[480px]:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 15V4" />
            <path d="M8 7.5L12 3.5l4 4" />
            <path d="M5.5 11.5V19h13v-7.5" />
          </svg>
        </button>

        {/* 画中画开关（不支持 Document PiP 的浏览器点击静默无效果） */}
        <button
          type="button"
          onClick={pipWindow ? closePip : () => void openPip()}
          aria-pressed={pipWindow !== null}
          aria-label={pipWindow ? "关闭画中画小窗" : "在画中画小窗中收听"}
          title={pipWindow ? "关闭画中画" : "画中画小窗"}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            pipWindow
              ? "border-accent/60 bg-accent/10 text-accent"
              : "border-border bg-surface text-text-muted hover:border-primary/40 hover:text-text"
          }`}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
      {pipWindow && <PipPortal pipWindow={pipWindow} />}
    </div>
  );
}

/** 画中画小窗内容：portal 到独立窗口，复用播放上下文 */
function PipPlayer() {
  const { current, state, toggle, playFromHistory } = usePlayer();
  if (!current) return null;
  const isPlaying = state === "playing";
  const isLoading = state === "loading";
  const statusText = isLoading ? "正在连接…" : isPlaying ? "正在播放" : "已暂停";

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-text">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 text-xl font-bold"
      >
        {current.name.slice(0, 1).toUpperCase()}
      </span>
      <p className="max-w-full truncate text-center text-sm font-semibold">{current.name}</p>
      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            isLoading ? "bg-amber-500 animate-pulse" : isPlaying ? "bg-success animate-pulse" : "bg-text-muted/50"
          }`}
        />
        {statusText}
        {isPlaying && <EqualizerBars />}
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => playFromHistory("prev")}
          aria-label="上一首（播放历史）"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M6 5h2v14H6zM20 5v14l-9-7z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? "暂停" : "播放"}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-lg transition-transform hover:scale-[1.04] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {isPlaying ? (
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11a1 1 0 0 0 1.53.85l8.6-5.5a1 1 0 0 0 0-1.7l-8.6-5.5A1 1 0 0 0 4 2.5z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => playFromHistory("next")}
          aria-label="下一首（播放历史）"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 5h2v14h-2zM4 5v14l9-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** 画中画 portal：独立窗口中渲染迷你播放器 */
function PipPortal({ pipWindow }: { pipWindow: PipWindow }) {
  return createPortal(<PipPlayer />, pipWindow.document.body);
}
