import { test, expect } from "@playwright/test";

test.describe("Dashboard - 인증 상태", () => {
  test("대시보드 로드 → 통계 카드 표시", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("총 거래")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Dashboard - 비인증 상태", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("비로그인 상태 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
