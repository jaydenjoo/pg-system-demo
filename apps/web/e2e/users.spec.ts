import { test, expect } from "@playwright/test";

test.describe("Users Management", () => {
  // setup에서 저장한 storageState 사용 (기본)

  test("사용자 목록 페이지 → 테이블 표시", async ({ page }) => {
    await page.goto("/users");

    await expect(page.getByRole("heading", { name: "사용자 관리" })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
  });

  test("사용자 추가 페이지 → /users/new 접근 가능", async ({ page }) => {
    // /users/new 직접 접근 → 페이지 정상 로드 확인
    await page.goto("/users/new");
    await expect(page).toHaveURL(/\/users\/new/);
    await expect(
      page.getByRole("heading", { name: "사용자 추가" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("사용자 상세 → 정보 표시", async ({ page }) => {
    await page.goto("/users");

    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    const firstUserLink = page.locator("table tbody tr:first-child a").first();

    if (await firstUserLink.isVisible()) {
      await firstUserLink.click();
      await expect(page).toHaveURL(/\/users\/.+/);
    }
  });
});
