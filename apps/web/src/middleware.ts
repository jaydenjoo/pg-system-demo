import { NextResponse, type NextRequest } from "next/server";
import {
  buildCspHeader,
  buildCheckoutIframeCspHeader,
} from "@/lib/csp-directives";

const PUBLIC_PATHS = [
  "/login",
  "/_next",
  "/favicon.ico",
  "/api",
  "/checkout-iframe",
  "/checkout",
];
const CHECKOUT_IFRAME_PATH = "/checkout-iframe";

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname === "/";
}

/**
 * JWT payload에서 userType 추출 (서명 검증 없이 디코딩만).
 * Edge Runtime에서 동작 가능. 서명 검증은 백엔드 API가 담당.
 */
function extractUserType(
  token: string,
): "ADMIN" | "AGENT" | "MERCHANT" | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1])) as {
      userType?: string;
    };
    const ut = payload.userType;
    if (ut === "ADMIN" || ut === "AGENT" || ut === "MERCHANT") return ut;
    return null;
  } catch {
    return null;
  }
}

/** userType에 맞는 기본 대시보드 경로 반환 */
function getHomePath(userType: "ADMIN" | "AGENT" | "MERCHANT"): string {
  switch (userType) {
    case "MERCHANT":
      return "/m/dashboard";
    case "AGENT":
      return "/a/dashboard";
    default:
      return "/dashboard";
  }
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // 매 요청마다 고유 nonce 생성
  const nonce = crypto.randomUUID();

  // 인증 체크 (비공개 경로만)
  if (!isPublicPath(pathname)) {
    const token = request.cookies.get("accessToken")?.value;

    if (token === undefined || token === "") {
      const loginUrl = new URL("/login", request.url);
      const response = NextResponse.redirect(loginUrl);
      response.headers.set("x-nonce", nonce);
      response.headers.set(
        "Content-Security-Policy",
        buildCspHeader(nonce),
      );
      return response;
    }

    // userType별 라우트 보호
    const userType = extractUserType(token);
    if (userType !== null) {
      const isMerchantRoute = pathname.startsWith("/m/");
      const isAgentRoute = pathname.startsWith("/a/");
      const isAdminRoute =
        !isMerchantRoute &&
        !isAgentRoute &&
        (pathname.startsWith("/dashboard") ||
          pathname.startsWith("/merchants") ||
          pathname.startsWith("/agents") ||
          pathname.startsWith("/transactions") ||
          pathname.startsWith("/settlements") ||
          pathname.startsWith("/commissions") ||
          pathname.startsWith("/deposits") ||
          pathname.startsWith("/security") ||
          pathname.startsWith("/system") ||
          pathname.startsWith("/users") ||
          pathname.startsWith("/roles") ||
          pathname.startsWith("/profile"));

      // 가맹점 유저가 관리자/대리점 경로 접근 시도 → 가맹점 대시보드로
      if (userType === "MERCHANT" && (isAdminRoute || isAgentRoute)) {
        const redirectUrl = new URL(getHomePath(userType), request.url);
        const response = NextResponse.redirect(redirectUrl);
        response.headers.set("x-nonce", nonce);
        response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
        return response;
      }

      // 대리점 유저가 관리자/가맹점 경로 접근 시도 → 대리점 대시보드로
      if (userType === "AGENT" && (isAdminRoute || isMerchantRoute)) {
        const redirectUrl = new URL(getHomePath(userType), request.url);
        const response = NextResponse.redirect(redirectUrl);
        response.headers.set("x-nonce", nonce);
        response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
        return response;
      }

      // 관리자가 가맹점/대리점 경로 접근 시도 → 관리자 대시보드로
      if (userType === "ADMIN" && (isMerchantRoute || isAgentRoute)) {
        const redirectUrl = new URL(getHomePath(userType), request.url);
        const response = NextResponse.redirect(redirectUrl);
        response.headers.set("x-nonce", nonce);
        response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
        return response;
      }
    }
  }

  // CSP nonce를 응답 헤더에 설정
  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  // 결제 iframe 경로는 가맹점 임베딩 허용 CSP 적용
  const cspHeader = pathname.startsWith(CHECKOUT_IFRAME_PATH)
    ? buildCheckoutIframeCspHeader(nonce)
    : buildCspHeader(nonce);

  // 하위 서버 컴포넌트에서 nonce를 읽을 수 있도록 요청 헤더에 설정
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
