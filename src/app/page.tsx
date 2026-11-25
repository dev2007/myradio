import { searchStations } from "@/lib/radio-browser";
import { AppShell } from "@/components/AppShell";
import type { Station } from "@/types/station";

export default async function Home() {
  let initialItems: Station[] = [];
  let initialError: string | null = null;
  try {
    initialItems = await searchStations({ order: "clickcount", limit: 50 }, 300);
  } catch {
    initialError = "电台数据源暂时不可用，请稍后重试";
  }

  return <AppShell initialItems={initialItems} initialError={initialError} />;
}
