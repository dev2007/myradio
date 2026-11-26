import type { Station } from "@/types/station";
import { getFavorites, getHistory, mergeFavorites, mergeHistory } from "@/lib/favorites-context";

/** 备份文件结构：版本化，向后兼容留余地 */
export interface BackupFile {
  version: 1;
  exportedAt: string;
  favorites: Station[];
  history: Station[];
}

const BACKUP_VERSION = 1;

/** 导出收藏与播放历史为 JSON 文件下载 */
export function downloadBackup(): void {
  const payload: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    favorites: getFavorites(),
    history: getHistory(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `myradio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 白名单字段清洗：只接受结构合法的电台数据，防止脏文件污染本地存储 */
function sanitizeStations(raw: unknown): Station[] {
  if (!Array.isArray(raw)) return [];
  const out: Station[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const s = item as Partial<Station>;
    if (typeof s.uuid !== "string" || !s.uuid) continue;
    if (typeof s.name !== "string" || !s.name) continue;
    if (typeof s.streamUrl !== "string" || !/^https?:\/\//i.test(s.streamUrl)) continue;
    out.push({
      uuid: s.uuid,
      name: s.name,
      streamUrl: s.streamUrl,
      homepage: typeof s.homepage === "string" ? s.homepage : "",
      favicon: typeof s.favicon === "string" ? s.favicon : "",
      tags: Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === "string") : [],
      country: typeof s.country === "string" ? s.country : "",
      countrycode: typeof s.countrycode === "string" ? s.countrycode.slice(0, 2) : "",
      language: typeof s.language === "string" ? s.language : "",
      votes: typeof s.votes === "number" ? s.votes : 0,
      clickcount: typeof s.clickcount === "number" ? s.clickcount : 0,
      codec: typeof s.codec === "string" ? s.codec : "",
      bitrate: typeof s.bitrate === "number" ? s.bitrate : 0,
      hls: s.hls === true,
    });
  }
  return out;
}

/**
 * 导入备份文件：与本地数据按 uuid 合并去重（不覆盖现有条目）。
 * 抛出 Error 时由调用方 toast 提示；成功返回各类新增数量。
 */
export async function importBackup(file: File): Promise<{ favAdded: number; histAdded: number }> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("导入失败：文件不是有效的 JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("导入失败：文件格式不正确");
  }
  const data = parsed as Partial<BackupFile>;
  if (data.version !== undefined && data.version !== BACKUP_VERSION) {
    throw new Error(`导入失败：备份版本不受支持（v${String(data.version)}）`);
  }
  const favs = sanitizeStations(data.favorites);
  const hist = sanitizeStations(data.history);
  if (favs.length === 0 && hist.length === 0) {
    throw new Error("导入失败：文件里没有可识别的电台数据");
  }
  return { favAdded: mergeFavorites(favs), histAdded: mergeHistory(hist) };
}
