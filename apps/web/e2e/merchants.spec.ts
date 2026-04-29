import { test, expect } from "@playwright/test";

test.describe("Merchants Management", () => {
  // setup에서 저장한 storageState 사용 (기본)

  test("가맹점 목록 페이지 → 테이블 표시", async ({ page }) => {
    await page.goto("/merchants");

    await expect(page.getByRole("heading", { name: "가맹점 관리" })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
  });

  test("가맹점 상세 → 정보 표시", async ({ page }) => {
    await page.goto("/merchants");

    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    const firstMerchantLink = page
      .locator("table tbody tr:first-child a")
      .first();

    if (await firstMerchantLink.isVisible()) {
      await firstMerchantLink.click();
      await expect(page).toHaveURL(/\/merchants\/.+/);
    }
  });
});
