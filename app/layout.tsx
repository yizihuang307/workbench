import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://personal-workbench-visuals.yizi-huang307.chatgpt.site"),
  title: "我的工作台",
  description: "集中处理每日安排、工作记录与重要信息的个人工作中枢。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "我的工作台",
    description: "安排、记录与信息，一处完成。",
    images: [{ url: "/og.png", width: 1736, height: 909, alt: "我的工作台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "我的工作台",
    description: "安排、记录与信息，一处完成。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
