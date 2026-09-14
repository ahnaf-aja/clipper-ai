import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing"],
        disallow: ["/api/", "/dashboard", "/generate", "/projects", "/clips", "/exports", "/billing", "/settings", "/profile"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
