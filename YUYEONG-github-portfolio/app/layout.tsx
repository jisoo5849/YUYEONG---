import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "YUYEONG — 오늘의 경험을 설계하는 AI Agent",
    description:
      "당신의 시간, 마음, 날씨와 함께할 사람을 이해하고 오늘의 경험 전체를 설계하는 퍼스널 AI Agent.",
    applicationName: "YUYEONG",
    keywords: ["AI Agent", "경험 큐레이션", "데이트 코스", "하루 계획", "YUYEONG"],
    openGraph: {
      title: "YUYEONG — 오늘이라는 시간을 유영하다",
      description: "장소가 아니라 오늘의 경험 전체를 설계하는 AI Agent",
      type: "website",
      locale: "ko_KR",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "YUYEONG — 오늘이라는 시간을 유영하다" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "YUYEONG — 오늘이라는 시간을 유영하다",
      description: "장소가 아니라 오늘의 경험 전체를 설계하는 AI Agent",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
