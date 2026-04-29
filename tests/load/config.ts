export const BASE_URL =
  process.env["LOAD_TEST_URL"] ?? "http://localhost:4000";

export const THRESHOLDS = {
  p95_ms: 500,
  p99_ms: 1000,
  error_rate_pct: 1,
  min_rps: 50,
};

// Basic Auth for PG Gateway (테스트용 가맹점)
export const PG_AUTH = {
  merchantId:
    process.env["LOAD_TEST_MERCHANT_ID"] ?? "test-merchant-001",
  secretKey:
    process.env["LOAD_TEST_SECRET_KEY"] ?? "sk_test_secret_key_for_load",
};

// JWT for Admin API
export const ADMIN_AUTH = {
  loginId: process.env["LOAD_TEST_ADMIN_ID"] ?? "admin",
  password: process.env["LOAD_TEST_ADMIN_PW"] ?? "Admin1234!@",
};
