import { test, expect } from "@playwright/test";

test.describe("Auth Flow - 인증 상태", () => {
  // setup에서 저장한 storageState 사용 (기본)

  test("인증 후 대시보드 접근 가능", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("인증 쿠키 제거 → /login 리다이렉트", async ({ page }) => {
    // 대시보드 접근 확인
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // 인증 쿠키 제거 (로그아웃과 동일 효과)
    await page.context().clearCookies();

    // 보호된 페이지 재접근 → /login 리다이렉트 확인
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});

test.describe("Auth Flow - 비인증 상태", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("로그인 페이지 → 폼 요소 표시", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("#loginId")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#password")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("비로그인 → 대시보드 접근 시 /login 리다이렉트", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
