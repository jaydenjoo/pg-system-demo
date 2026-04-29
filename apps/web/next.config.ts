import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker standalone 빌드용
  output: "standalone",

  // 개발 모드: API 프록시 (브라우저 → Next.js → API 서버)
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL ?? "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/pg/:path*",
        destination: `${apiUrl}/pg/:path*`,
      },
    ];
  },

  // Strict mode for development
  reactStrictMode: true,

  // Transpile shared packages
  transpilePackages: ["@pg-system/shared"],

  // Security headers (CSP는 middleware.ts에서 nonce와 함께 동적 설정)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
