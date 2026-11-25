import { NextRequest, NextResponse } from "next/server";
import { getFilterOptions } from "@/lib/radio-browser";
import type { FiltersResponse } from "@/types/station";

const VALID_KINDS = new Set(["countries", "languages", "tags"]);

/** GET /api/filters?type=countries|languages|tags */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("type") ?? "countries";
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "无效的 type 参数" }, { status: 400 });
  }
  try {
    const items = await getFilterOptions(kind as "countries" | "languages" | "tags");
    const body: FiltersResponse = { items };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取筛选项失败" },
      { status: 502 }
    );
  }
}
