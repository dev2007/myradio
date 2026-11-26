import type { Station } from "@/types/station";

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** 分享电台：优先系统分享面板，否则复制 ?station=uuid 链接（打开链接会自动播放） */
export async function shareStation(station: Station): Promise<ShareResult> {
  const url = `${window.location.origin}/?station=${station.uuid}`;
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: station.name, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "failed";
  }
}
