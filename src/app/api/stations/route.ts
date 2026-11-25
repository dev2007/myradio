import { NextRequest, NextResponse } from "next/server";
import { searchStations } from "@/lib/radio-browser";
import type { StationsResponse } from "@/types/station";

/** GET /api/stations?name=&countrycode=&language=&tag=&order=clickcount|votes&limit=&offset= */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    const items = await searchStations({
      name: sp.get("name")?.trim() || undefined,
      countrycode: sp.get("countrycode")?.trim() || undefined,
      language: sp.get("language")?.trim() || undefined,
      tag: sp.get("tag")?.trim() || undefined,
      order: sp.get("order") === "votes" ? "votes" : "clickcount",
      limit: Number(sp.get("limit")) || 50,
      offset: Number(sp.get("offset")) || 0,
    });
    const body: StationsResponse = { items };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取电台列表失败" },
      { status: 502 }
    );
  }
}
