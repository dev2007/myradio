/** 精简后的电台数据（从 Radio Browser 原始字段裁剪，减小传输体积） */
export interface Station {
  uuid: string;
  name: string;
  streamUrl: string;
  homepage: string;
  favicon: string;
  tags: string[];
  country: string;
  countrycode: string;
  language: string;
  votes: number;
  clickcount: number;
  codec: string;
  bitrate: number;
  hls: boolean;
}

/** 筛选器选项（国家/语言/类型通用） */
export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** 电台列表接口返回 */
export interface StationsResponse {
  items: Station[];
}

/** 筛选项列表接口返回 */
export interface FiltersResponse {
  items: FilterOption[];
}

export type StationOrder = "clickcount" | "votes";

/** /api/stations 的查询参数 */
export interface StationQuery {
  name?: string;
  countrycode?: string;
  language?: string;
  tag?: string;
  order?: StationOrder;
  limit?: number;
  offset?: number;
}
