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
  ];
}
