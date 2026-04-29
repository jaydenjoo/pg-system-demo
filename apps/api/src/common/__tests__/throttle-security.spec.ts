import * as fs from "fs";
import * as path from "path";

describe("Rate Limiting Security Tests", () => {
  const appModulePath = path.resolve(__dirname, "../../app.module.ts");
  const appConfigPath = path.resolve(__dirname, "../../config/app.config.ts");

  let appModuleSource: string;
  let appConfigSource: string;

  beforeAll(() => {
    appModuleSource = fs.readFileSync(appModulePath, "utf-8");
    appConfigSource = fs.readFileSync(appConfigPath, "utf-8");
  });

  // ---- 1. ThrottlerModule 구성 확인 ----
  describe("ThrottlerModule 구성 확인", () => {
    it("AppModule imports에 ThrottlerModule 포함", () => {
      expect(appModuleSource).toContain("ThrottlerModule");
    });

    it("ThrottlerGuard가 APP_GUARD로 등록", () => {
      expect(appModuleSource).toContain("APP_GUARD");
      expect(appModuleSource).toContain("ThrottlerGuard");
      // APP_GUARD + ThrottlerGuard가 같은 provider에 있는지 확인
      expect(appModuleSource).toMatch(
        /provide:\s*APP_GUARD.*useClass:\s*ThrottlerGuard/s,
      );
    });

    it("throttleConfig에 ttl 기본값 60000 존재", () => {
      // app.config.ts에서 기본값 확인
      expect(appConfigSource).toMatch(/THROTTLE_TTL.*60000/);
    });

    it("throttleConfig에 limit 기본값 100 존재", () => {
      expect(appConfigSource).toMatch(/THROTTLE_LIMIT.*100/);
    });
  });

  // ---- 2. 로그인 Rate Limiting 구성 ----
  describe("로그인 Rate Limiting 구성", () => {
    it("loginLimit 기본값 5", () => {
      expect(appConfigSource).toMatch(/LOGIN_THROTTLE_LIMIT.*5/);
      // registerAs 내부 기본값 확인
      expect(appConfigSource).toContain("loginLimit");
    });

    it("paymentLimit 기본값 10", () => {
      expect(appConfigSource).toMatch(/PAYMENT_THROTTLE_LIMIT.*10/);
      expect(appConfigSource).toContain("paymentLimit");
    });
  });

  // ---- 3. ThrottlerModule 설정 상세 ----
  describe("ThrottlerModule 설정 상세", () => {
    it("ThrottlerModule.forRootAsync 사용 (ConfigService 주입)", () => {
      expect(appModuleSource).toContain("ThrottlerModule.forRootAsync");
      expect(appModuleSource).toContain("ConfigService");
    });

    it("ThrottlerModuleOptions 타입 import 확인", () => {
      expect(appModuleSource).toContain("ThrottlerModuleOptions");
    });

    it("throttle.ttl과 throttle.limit를 ConfigService에서 로드", () => {
      // useFactory에서 config.get 사용 확인
      expect(appModuleSource).toMatch(/config\.get.*throttle\.ttl/);
      expect(appModuleSource).toMatch(/config\.get.*throttle\.limit/);
    });
  });
});
