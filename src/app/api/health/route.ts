import { NextResponse } from "next/server";

/** 健康检查：供容器 healthcheck 与反向代理探活使用 */
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
