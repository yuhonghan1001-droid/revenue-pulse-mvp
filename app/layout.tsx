import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "广告收入经营罗盘｜Revenue Pulse",
  description: "面向电商广告业务的收入监控、预测、动因分析与数据质量驾驶舱。",
};

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
