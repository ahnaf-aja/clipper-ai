import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/ui/theme";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Clipper AI — Turn Any YouTube Video Into Viral Shorts",
    template: "%s · Clipper AI",
  },
  description:
    "Paste a YouTube link and let AI find the funniest, most engaging, most emotional and highest-retention moments — then cut, caption and export them as Shorts, Reels and TikToks.",
  keywords: [
    "AI video editor", "YouTube to Shorts", "viral clips", "auto subtitles",
    "TikTok clips", "Instagram Reels", "video repurposing", "clip generator",
  ],
  authors: [{ name: "Clipper AI" }],
  openGraph: {
    type: "website",
    title: "Clipper AI — Turn Any YouTube Video Into Viral Shorts",
    description:
      "AI that understands your video, not just its keywords. Find the best moments and export them in one click.",
    siteName: "Clipper AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clipper AI — Turn Any YouTube Video Into Viral Shorts",
    description: "AI that finds and cuts your most viral moments automatically.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#06060a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Archivo+Black&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Clipper AI",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            }),
          }}
        />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
