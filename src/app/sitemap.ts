import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getAppBaseUrl(),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...["/matchmaking", "/eventos", "/club", "/unete"].map((path) => ({
      url: `${getAppBaseUrl()}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    {
      url: `${getAppBaseUrl()}/colaboraciones`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
