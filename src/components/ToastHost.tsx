"use client";

import { useEffect, useRef, useState } from "react";
import { onToast } from "@/lib/toast";

interface ToastItem {
  id: number;
  message: string;
}

const TOAST_DURATION = 2500;

/** 全局 toast 容器：底部居中，aria-live 让读屏软件播报 */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return onToast(({ id, message }) => {
      setItems((prev) => [...prev.slice(-2), { id, message }]);
      const timer = setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, TOAST_DURATION);
      timersRef.current.set(id, timer);
    });
  }, []);

  // 卸载时清理未到期的定时器
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {items.map((t) => (
        <p
          key={t.id}
          className="max-w-[80vw] rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-text shadow-lg"
        >
          {t.message}
        </p>
      ))}
    </div>
  );
}
