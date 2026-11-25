import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "我的广播 · 全球电台收音机",
    short_name: "我的广播",
    description: "免费收听全球 6 万多个广播电台：音乐、新闻、脱口秀，打开就听。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f8",
    theme_color: "#f4f5f8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
