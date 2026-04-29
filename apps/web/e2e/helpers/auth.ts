import { type Page } from "@playwright/test";

const API_BASE = "http://localhost:4000/api/v1";

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

/**
 * NestJS API 직접 호출 → 쿠키 주입 방식 로그인
 * (storageState 패턴과 별도로 개별 테스트에서 사용 가능)
 */
export async function login(
  page: Page,
  loginId: string,
  password: string,
): Promise<void> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`로그인 실패: ${response.status()} ${text}`);
  }

  const body: ApiResponse = await response.json();

  if (!body.data.accessToken) {
    throw new Error("로그인 응답에 accessToken 없음");
  }

  await page.context().addCookies([
    {
      name: "accessToken",
      value: body.data.accessToken,
      domain: "localhost",
      path: "/",
    },
  ]);

  if (body.data.refreshToken) {
    await page.context().addCookies([
      {
        name: "refreshToken",
        value: body.data.refreshToken,
        domain: "localhost",
        path: "/",
      },
    ]);
  }

  await page.goto("/dashboard");
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, "admin", "Admin1234!@");
}
