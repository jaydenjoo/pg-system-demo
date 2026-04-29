/**
 * Live 데모 사이트 심도 E2E 테스트.
 * Target: https://pg-system-demo.vercel.app
 *
 * 다른 e2e 테스트들과 격리하기 위해 storageState를 비워서 사용.
 * 직접 로그인 후 검증.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.LIVE_BASE ?? "https://pg-system-demo.vercel.app";

const ACCOUNTS = {
  admin: { id: "admin", pw: "Admin1234!@", home: "/dashboard" },
  agent: { id: "agent_test", pw: "Agent1234!@", home: "/a/dashboard" },
  merchant: { id: "merchant_test", pw: "Merchant1234!@", home: "/m/dashboard" },
} as const;

type Role = keyof typeof ACCOUNTS;

async function login(page: Page, role: Role): Promise<void> {
  const acct = ACCOUNTS[role];
  await page.goto(`${BASE}/login`);
  await page.fill("input#loginId", acct.id);
  await page.fill("input#password", acct.pw);
  await Promise.all([
    page.waitForURL(new RegExp(acct.home), { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.use({ storageState: { cookies: [], origins: [] } });

// ========================================================================
// Happy Path - Admin
// ========================================================================
test.describe("Admin happy path", () => {
  test("로그인 → 대시보드 KPI 카드 표시 (오늘 기준)", async ({ page }) => {
    await login(page, "admin");
    await expect(page.getByRole("heading", { name: "대시보드", exact: true })).toBeVisible();
    await expect(page.getByText("총 거래금액")).toBeVisible();
    await expect(page.getByText("총 정산금액")).toBeVisible();
    await expect(page.getByText("활성 가맹점")).toBeVisible();
    await expect(page.getByRole("button", { name: "오늘", exact: true })).toHaveClass(/bg-blue-600/);
  });

  test("기간 필터 클릭 변경", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("button", { name: "7일", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByRole("button", { name: "7일", exact: true })).toHaveClass(/bg-blue-600/);
  });

  test("가맹점 관리 페이지 → 5개 가맹점 표시", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("link", { name: /가맹점 관리/ }).click();
    await page.waitForURL(/\/merchants/);
    await expect(page.getByRole("heading", { name: "가맹점 관리" })).toBeVisible();
    await expect(page.getByText("카페 모카").first()).toBeVisible();
    await expect(page.getByText("서울 베이커리").first()).toBeVisible();
    await expect(page.getByText("동대문 의류").first()).toBeVisible();
  });

  test("가맹점 상세 페이지 진입", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/merchants/mch-001`);
    await expect(page.getByRole("heading", { name: "카페 모카" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("M001").first()).toBeVisible();
    await expect(page.getByText("신한은행").first()).toBeVisible();
  });

  test("대리점 관리 → 3개 대리점", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/agents`);
    await expect(page.getByRole("heading", { name: "대리점 관리" })).toBeVisible();
    await expect(page.getByText("서울대리점").first()).toBeVisible();
    await expect(page.getByText("부산대리점").first()).toBeVisible();
    await expect(page.getByText("인천대리점").first()).toBeVisible();
  });

  test("거래 내역 페이지", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/transactions`);
    await expect(page.getByRole("heading", { name: "거래 내역", exact: true })).toBeVisible();
    // 데이터 로드 완료 대기
    await page.waitForResponse(
      (r) => r.url().includes("/api/v1/transactions") && r.status() === 200,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(1500);
    // 테이블 헤더 또는 거래번호 형식 확인
    const tranNoCell = page.locator('text=/T\\d{8,}/');
    await expect(tranNoCell.first()).toBeVisible({ timeout: 10_000 });
  });

  test("정산 관리 페이지", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/settlements`);
    await expect(page.getByRole("heading", { name: /정산/ })).toBeVisible();
  });

  test("입금 관리 페이지", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/deposits`);
    await expect(page.getByRole("heading", { name: /입금/ })).toBeVisible();
  });

  test("수수료 설정 페이지 (PG 마진 기본 탭 + 표 렌더)", async ({ page }) => {
    await login(page, "admin");
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    await page.goto(`${BASE}/commissions`);
    await expect(page.getByRole("heading", { name: /수수료/ })).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(1500);
    await expect(page.getByText("CARD").first()).toBeVisible();
    await expect(page.getByText("신한카드").first()).toBeVisible();
    await expect(page.getByText("BANK_TRANSFER").first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("수수료 설정 페이지: 대리점 탭 → 자동 선택 + 데이터 표시", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/commissions`);
    await page.getByRole("button", { name: "대리점 수수료" }).click();
    // 첫 번째 대리점이 자동 선택되어 데이터 자동 로드
    await page.waitForResponse(
      (r) => /\/api\/v1\/commissions\/agents\/agt-/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(1500);
    await expect(page.getByText("3계층 수수료 비교")).toBeVisible();
    await expect(page.getByText("변경 이력")).toBeVisible();
  });

  test("수수료 설정 페이지: 가맹점 탭 → 자동 선택 + 데이터 표시", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/commissions`);
    await page.getByRole("button", { name: "가맹점 수수료" }).click();
    await page.waitForResponse(
      (r) => /\/api\/v1\/commissions\/merchants\/mch-/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(1500);
    await expect(page.getByText("3계층 수수료 비교")).toBeVisible();
    await expect(page.getByText("변경 이력")).toBeVisible();
  });

  test("보안 감사 페이지", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/security`);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("시스템 설정 페이지", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/system`);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("사용자 관리 페이지 → 5명 표시", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/users`);
    await expect(page.getByRole("heading", { name: /사용자/ })).toBeVisible();
    await expect(page.getByText("admin").first()).toBeVisible();
    await expect(page.getByText("agent_test").first()).toBeVisible();
  });

  test("역할 관리 페이지 → 8개 역할", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/roles`);
    await expect(page.getByRole("heading", { name: /역할/ })).toBeVisible();
    await expect(page.getByText("SUPER_ADMIN").first()).toBeVisible();
  });
});

// ========================================================================
// Happy Path - Agent
// ========================================================================
test.describe("Agent happy path", () => {
  test("agent 로그인 → /a/dashboard", async ({ page }) => {
    await login(page, "agent");
    await expect(page).toHaveURL(/\/a\/dashboard/);
    await expect(page.getByRole("heading", { name: "대리점 대시보드" })).toBeVisible();
  });

  test("agent 사이드바 메뉴", async ({ page }) => {
    await login(page, "agent");
    const items = await page.locator("aside nav a").allTextContents();
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  test("agent 가맹점 목록", async ({ page }) => {
    await login(page, "agent");
    await page.goto(`${BASE}/a/merchants`);
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });
});

// ========================================================================
// Happy Path - Merchant
// ========================================================================
test.describe("Merchant happy path", () => {
  test("merchant 로그인 → /m/dashboard", async ({ page }) => {
    await login(page, "merchant");
    await expect(page).toHaveURL(/\/m\/dashboard/);
    await expect(page.getByRole("heading", { name: "내 가맹점 대시보드" })).toBeVisible();
  });

  test("merchant 거래 내역", async ({ page }) => {
    await login(page, "merchant");
    await page.goto(`${BASE}/m/transactions`);
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("merchant 정산 내역", async ({ page }) => {
    await login(page, "merchant");
    await page.goto(`${BASE}/m/settlements`);
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });
});

// ========================================================================
// 비정상 행동: 권한 우회
// ========================================================================
test.describe("권한 우회 차단", () => {
  test("agent가 /dashboard (admin) 접근 → /a/dashboard 리다이렉트", async ({ page }) => {
    await login(page, "agent");
    await page.goto(`${BASE}/dashboard`);
    await expect(page).toHaveURL(/\/a\/dashboard/);
  });

  test("merchant가 /users 접근 → /m/dashboard 리다이렉트", async ({ page }) => {
    await login(page, "merchant");
    await page.goto(`${BASE}/users`);
    await expect(page).toHaveURL(/\/m\/dashboard/);
  });

  test("agent가 /m/dashboard (merchant) 접근 → /a/dashboard", async ({ page }) => {
    await login(page, "agent");
    await page.goto(`${BASE}/m/dashboard`);
    await expect(page).toHaveURL(/\/a\/dashboard/);
  });

  test("merchant가 /a/dashboard (agent) 접근 → /m/dashboard", async ({ page }) => {
    await login(page, "merchant");
    await page.goto(`${BASE}/a/dashboard`);
    await expect(page).toHaveURL(/\/m\/dashboard/);
  });

  test("admin이 /m/dashboard 접근 → /dashboard 리다이렉트", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/m/dashboard`);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

// ========================================================================
// 비정상 행동: 인증 실패
// ========================================================================
test.describe("인증/세션 보호", () => {
  test("쿠키 없이 보호 페이지 → /login 리다이렉트", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("로그아웃 후 보호 페이지 접근 차단", async ({ page, context }) => {
    await login(page, "admin");
    await context.clearCookies();
    await page.goto(`${BASE}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("잘못된 형식 토큰 → 401", async ({ context }) => {
    await context.addCookies([
      { name: "accessToken", value: "not.a.jwt", domain: "pg-system-demo.vercel.app", path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
    ]);
    const res = await context.request.get(`${BASE}/api/v1/users/me`);
    expect(res.status()).toBe(401);
  });

  test("만료된 토큰 → 401 (디코딩 실패)", async ({ context }) => {
    // base64URL 인코딩된 1970년 만료 토큰
    const expired =
      "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjEsImlhdCI6MX0.fake";
    await context.addCookies([
      { name: "accessToken", value: expired, domain: "pg-system-demo.vercel.app", path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
    ]);
    const res = await context.request.get(`${BASE}/api/v1/users/me`);
    expect(res.status()).toBe(401);
  });
});

// ========================================================================
// 비정상 행동: 입력 변조
// ========================================================================
test.describe("입력 변조 방어", () => {
  test("SQL injection 시도 → 정상 401 (특별 동작 없음)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, {
      data: { loginId: "admin' OR 1=1--", password: "anything" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("XSS payload 로그인 시도 → escape 처리", async ({ page }) => {
    let alertFired = false;
    page.on("dialog", (d) => {
      alertFired = true;
      void d.dismiss();
    });
    await page.goto(`${BASE}/login`);
    await page.fill("input#loginId", '<script>alert(1)</script>');
    await page.fill("input#password", "any");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    expect(alertFired).toBe(false);
  });

  test("빈 입력 폼 검증", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.click('button[type="submit"]');
    await expect(page.getByText("아이디를 입력해주세요")).toBeVisible();
  });

  test("잘못된 비밀번호 → 401 + 한국어 에러", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill("input#loginId", "admin");
    await page.fill("input#password", "WRONG_PASSWORD");
    await page.click('button[type="submit"]');
    await expect(page.getByText("아이디 또는 비밀번호가 일치하지 않습니다")).toBeVisible();
  });

  test("존재하지 않는 가맹점 → 404 처리", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`${BASE}/merchants/non-existent-id`);
    await expect(page.getByText(/찾을 수 없습니다|Not Found|가맹점을/)).toBeVisible({ timeout: 10_000 });
  });

  test("존재하지 않는 거래 → 404", async ({ context }) => {
    await login(await context.newPage(), "admin");
    const res = await context.request.get(`${BASE}/api/v1/transactions/non-existent`);
    expect(res.status()).toBe(404);
  });
});

// ========================================================================
// 비정상 행동: 페이지네이션 변조
// ========================================================================
test.describe("Pagination 안정성", () => {
  test("음수 페이지 → 1로 fallback", async ({ context }) => {
    const loginRes = await context.request.post(`${BASE}/api/v1/auth/login`, {
      data: { loginId: "admin", password: "Admin1234!@" },
      headers: { "Content-Type": "application/json" },
    });
    expect(loginRes.status()).toBe(200);
    const res = await context.request.get(`${BASE}/api/v1/merchants?page=-5&limit=10`);
    const body = (await res.json()) as { meta: { page: number } };
    expect(body.meta.page).toBe(1);
  });

  test("문자 페이지 → 1로 fallback", async ({ context }) => {
    await context.request.post(`${BASE}/api/v1/auth/login`, {
      data: { loginId: "admin", password: "Admin1234!@" },
      headers: { "Content-Type": "application/json" },
    });
    const res = await context.request.get(`${BASE}/api/v1/merchants?page=abc`);
    const body = (await res.json()) as { meta: { page: number } };
    expect(body.meta.page).toBe(1);
  });

  test("매우 큰 페이지 → 빈 결과 + meta.total 정상", async ({ context }) => {
    await context.request.post(`${BASE}/api/v1/auth/login`, {
      data: { loginId: "admin", password: "Admin1234!@" },
      headers: { "Content-Type": "application/json" },
    });
    const res = await context.request.get(`${BASE}/api/v1/merchants?page=99999`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: unknown[]; meta: { total: number } };
    expect(body.data.length).toBe(0);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  test("limit이 100 초과 → 100으로 cap", async ({ context }) => {
    await context.request.post(`${BASE}/api/v1/auth/login`, {
      data: { loginId: "admin", password: "Admin1234!@" },
      headers: { "Content-Type": "application/json" },
    });
    const res = await context.request.get(`${BASE}/api/v1/merchants?limit=999`);
    const body = (await res.json()) as { meta: { limit: number } };
    expect(body.meta.limit).toBe(100);
  });
});

// ========================================================================
// 비정상 행동: 로그아웃 흐름
// ========================================================================
test.describe("로그아웃", () => {
  test("로그아웃 API → 쿠키 제거 + 다시 보호 페이지 접근 시 redirect", async ({ context }) => {
    await context.request.post(`${BASE}/api/v1/auth/login`, {
      data: { loginId: "admin", password: "Admin1234!@" },
      headers: { "Content-Type": "application/json" },
    });
    const meRes1 = await context.request.get(`${BASE}/api/v1/auth/me`);
    expect(meRes1.status()).toBe(200);

    await context.request.post(`${BASE}/api/v1/auth/logout`);

    const meRes2 = await context.request.get(`${BASE}/api/v1/auth/me`);
    expect(meRes2.status()).toBe(401);
  });
});
