import { test as setup } from "@playwright/test";

const API_BASE = "http://localhost:4000/api/v1";
const AUTH_FILE = "e2e/.auth/admin.json";

interface LoginResponseData {
  requireMfa: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

interface ApiResponse {
  success: boolean;
  data: LoginResponseData;
}

setup("admin 인증 상태 저장", async ({ page }) => {
  // NestJS API 직접 호출로 로그인
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: "admin", password: "Admin1234!@" },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`로그인 실패: ${response.status()} ${text}`);
  }

  const body: ApiResponse = await response.json();

  if (!body.data.accessToken) {
    throw new Error("로그인 응답에 accessToken 없음");
  }

  // 브라우저 컨텍스트에 인증 쿠키 설정
  const cookies = [
    {
      name: "accessToken",
      value: body.data.accessToken,
      domain: "localhost",
      path: "/",
    },
  ];

  if (body.data.refreshToken) {
    cookies.push({
      name: "refreshToken",
      value: body.data.refreshToken,
      domain: "localhost",
      path: "/",
    });
  }

  await page.context().addCookies(cookies);

  // 인증 상태 파일로 저장
  await page.context().storageState({ path: AUTH_FILE });
});
