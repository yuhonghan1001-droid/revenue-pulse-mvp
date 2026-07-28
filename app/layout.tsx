import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "revenue-pulse-mvp.happynamely.chatgpt.site";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;

  return {
    title: "广告收入经营罗盘｜Revenue Pulse",
    description:
      "面向电商广告业务的双路径收入归因、广告主健康、体验护栏、数据治理与可追溯经营简报。",
    openGraph: {
      title: "Revenue Pulse｜广告收入经营罗盘",
      description: "双路径归因 · 统一口径 · 可追溯洞察",
      type: "website",
      images: [{ url: `${baseUrl}/og-v3.png`, width: 1774, height: 887 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Revenue Pulse｜广告收入经营罗盘",
      description: "双路径归因 · 统一口径 · 可追溯洞察",
      images: [`${baseUrl}/og-v3.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        {children}
      </body>
    </html>
  );
}
