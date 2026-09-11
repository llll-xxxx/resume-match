import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResumeMatch — 简历关键词匹配工作台",
  description: "针对职位描述逐项检查、修改并导出简历。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
