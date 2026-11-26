"use client";

import { useRef, useState } from "react";
import { downloadBackup, importBackup } from "@/lib/backup";
import { toast } from "@/lib/toast";

const btnClass =
  "relative flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-text-muted transition-colors hover:border-primary/40 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

/** 头栏右上角备份抽屉：收藏与播放历史的导出/导入。
 *  指向（hover）图标即展开面板，触屏点击图标切换；Escape 关闭。 */
export function BackupBar() {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { favAdded, histAdded } = await importBackup(file);
      toast(
        favAdded + histAdded === 0
          ? "备份内容与本地数据一致，无需导入"
          : `导入成功：新增收藏 ${favAdded} 个、最近播放 ${histAdded} 条`
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "导入失败，请检查文件");
    } finally {
      // 允许再次选择同一文件重新导入
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="收藏与播放历史数据的导出与导入"
        title="收藏与历史数据备份"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          open ? "text-text" : "text-text-muted hover:text-text"
        }`}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
          <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </svg>
      </button>

      {/* 抽屉面板：pt-2 桥接图标与面板的 hover 间隙，隐藏时 visibility 不可聚焦 */}
      <div
        className={`absolute right-0 top-full z-40 pt-2 transition-opacity duration-150 ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="w-60 rounded-xl border border-border bg-surface p-3 shadow-lg">
          <p className="text-xs font-semibold text-text">收藏与历史数据</p>
          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
            导出收藏与最近播放的备份文件；导入自动按电台合并去重，不覆盖现有数据。
          </p>
          <div className="mt-2.5 flex gap-2">
      <button
        type="button"
        onClick={downloadBackup}
        className={btnClass}
        aria-label="导出收藏与播放历史备份文件"
      >
        <svg
          aria-hidden="true"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4v11" />
          <path d="M8 11.5l4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
        导出
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={btnClass}
        aria-label="从备份文件导入收藏与播放历史"
      >
        <svg
          aria-hidden="true"
          width="13"
          height="13"
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
        导入
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onImportFile(e.target.files?.[0])}
      />
        </div>
      </div>
    </div>
    </div>
  );
}
