import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "羽见千年｜金沙沉浸式数字体验",
    description: "跟随曦羽飞越自然、文明与记忆，进入金沙文明的数字旅程。",
    openGraph: {
      title: "羽见千年｜金沙沉浸式数字体验",
      description: "跟随曦羽飞越自然、文明与记忆，进入金沙文明的数字旅程。",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "羽见千年：金沙沉浸式数字体验" }],
      locale: "zh_CN",
      type: "website",
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
