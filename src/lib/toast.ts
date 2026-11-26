/** 轻量 toast：模块级事件广播，由 AppShell 内的 ToastHost 渲染（无 Provider 依赖） */

interface ToastPayload {
  id: number;
  message: string;
}

const TOAST_EVENT = "radioo:toast";
let seq = 0;

/** 弹出一条 toast，2.5 秒后自动消失 */
export function toast(message: string): void {
  if (typeof window === "undefined") return;
  seq += 1;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { id: seq, message } }));
}

/** 供 ToastHost 监听 */
export function onToast(handler: (payload: ToastPayload) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ToastPayload>).detail);
  window.addEventListener(TOAST_EVENT, listener);
  return () => window.removeEventListener(TOAST_EVENT, listener);
}
