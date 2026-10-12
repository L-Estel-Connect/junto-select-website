import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/config/appBaseUrl";
import { isStagingDeploy } from "@/lib/config/deployEnv";

export default function robots(): MetadataRoute.Robots {
  // Staging is never crawled (JUNTO_DEPLOY_ENV is available at build time).
  if (isStagingDeploy()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /member, /admin, /introduction also carry their own
      // `robots: { index: false }` metadata (see their layout.tsx files) —
      // disallowing the crawl here too means a crawler never even fetches
      // them in the first place, the stronger of the two protections.
      disallow: ["/api/", "/member/", "/admin/", "/introduction/"],
    },
    sitemap: `${getAppBaseUrl()}/sitemap.xml`,
  };
}
