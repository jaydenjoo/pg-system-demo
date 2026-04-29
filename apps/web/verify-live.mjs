import { chromium } from '@playwright/test';

const BASE_URL = 'https://pg-system-demo.vercel.app';

const scenarios = [
  { loginId: 'admin', password: 'Admin1234!@', expectedPath: '/dashboard', label: '관리자' },
  { loginId: 'agent_test', password: 'Agent1234!@', expectedPath: '/a/dashboard', label: '대리점' },
  { loginId: 'merchant_test', password: 'Merchant1234!@', expectedPath: '/m/dashboard', label: '가맹점' },
];

async function run() {
  const browser = await chromium.launch();
  const results = [];

  for (const scenario of scenarios) {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('input#loginId', scenario.loginId);
      await page.fill('input#password', scenario.password);

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/v1/auth/login'),
        { timeout: 15000 },
      );
      await page.click('button[type="submit"]');
      const response = await responsePromise;
      const apiStatus = response.status();

      try {
        await page.waitForURL(new RegExp(scenario.expectedPath), { timeout: 10000 });
      } catch {
        // capture state below
      }

      // 대시보드 렌더 안정화
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(2000);

      const finalUrl = page.url();
      const errorBox = await page.locator('.bg-red-50').first().textContent().catch(() => null);
      const cookies = (await context.cookies()).map((c) => c.name).join(',');
      const bodyText = await page.locator('body').innerText().catch(() => '');
      const bodyPreview = bodyText.slice(0, 200).replace(/\s+/g, ' ').trim();
      const stillOnDashboard = finalUrl.includes(scenario.expectedPath);

      results.push({
        label: scenario.label,
        loginId: scenario.loginId,
        success: stillOnDashboard && bodyText.length > 50,
        finalUrl,
        apiStatus,
        errorBox: errorBox?.trim() ?? null,
        cookies: cookies || '(none)',
        bodyPreview,
      });
    } catch (err) {
      results.push({
        label: scenario.label,
        loginId: scenario.loginId,
        success: false,
        finalUrl: page.url(),
        error: err.message,
      });
    } finally {
      await context.close();
    }
  }

  console.log('\n=== 로그인 검증 결과 ===');
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`\n${icon} ${r.label} (${r.loginId})`);
    console.log(`   Final URL: ${r.finalUrl}`);
    if (r.apiStatus) console.log(`   API: HTTP ${r.apiStatus}`);
    if (r.errorBox) console.log(`   UI Error: ${r.errorBox}`);
    if (r.cookies) console.log(`   Cookies: ${r.cookies}`);
    if (r.bodyPreview) console.log(`   Body: ${r.bodyPreview}`);
    if (r.error) console.log(`   Exception: ${r.error}`);
  }

  await browser.close();
  process.exit(results.every((r) => r.success) ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
