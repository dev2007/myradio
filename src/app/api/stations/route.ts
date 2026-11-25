import { NextRequest, NextResponse } from "next/server";
import { getStationByUuid, searchStations } from "@/lib/radio-browser";
import type { StationOrder, StationsResponse } from "@/types/station";

const ORDERS: StationOrder[] = ["clickcount", "votes", "random"];

/** GET /api/stations?uuid=… 单查 | ?name=&countrycode=&language=&tag=&order=clickcount|votes|random&limit=&offset= 列表 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  // 分享链接模式：按 uuid 单查
  const uuid = sp.get("uuid");
  if (uuid) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
      return NextResponse.json({ error: "无效的电台 id" }, { status: 400 });
    }
    try {
      const station = await getStationByUuid(uuid);
      const body: StationsResponse = { items: station ? [station] : [] };
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "获取电台失败" },
        { status: 502 }
      );
    }
  }

  const orderParam = sp.get("order") as StationOrder | null;
  const order: StationOrder = orderParam && ORDERS.includes(orderParam) ? orderParam : "clickcount";
  try {
    const items = await searchStations({
      name: sp.get("name")?.trim() || undefined,
      countrycode: sp.get("countrycode")?.trim() || undefined,
      language: sp.get("language")?.trim() || undefined,
      tag: sp.get("tag")?.trim() || undefined,
      order,
      limit: Number(sp.get("limit")) || 50,
      offset: Number(sp.get("offset")) || 0,
    });
    const body: StationsResponse = { items };
    // random 结果不能缓存，否则缓存期内所有人「随机」到同一个台
    const headers: Record<string, string> =
      order === "random"
        ? { "Cache-Control": "no-store" }
        : { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };
    return NextResponse.json(body, { headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取电台列表失败" },
      { status: 502 }
    );
  }
}
