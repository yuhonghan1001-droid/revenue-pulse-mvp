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
      "面向电商广告业务的收入监控、预测、动因分析、数据健康、指标治理与可追溯经营简报。",
    openGraph: {
      title: "Revenue Pulse｜广告收入经营罗盘",
      description: "24 数据源 · 统一口径 · 可追溯洞察",
      type: "website",
      images: [{ url: `${baseUrl}/og.png`, width: 1792, height: 895 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Revenue Pulse｜广告收入经营罗盘",
      description: "24 数据源 · 统一口径 · 可追溯洞察",
      images: [`${baseUrl}/og.png`],
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
      <body>{children}</body>
    </html>
  );
}
