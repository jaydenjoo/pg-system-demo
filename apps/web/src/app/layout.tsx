import type { Metadata } from "next";
import { getNonce } from "@/lib/csp-nonce";
import "./globals.css";

export const metadata: Metadata = {
  title: "PG System 관리자",
  description: "결제대행사 관리 시스템",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = await getNonce();

  return (
    <html lang="ko">
      <body className="antialiased" nonce={nonce}>
        {children}
        {/* 향후 외부 스크립트 추가 시 nonce 속성 사용 예시 */}
        {/* <Script src="/scripts/example.js" nonce={nonce} strategy="afterInteractive" /> */}
      </body>
    </html>
  );
}
