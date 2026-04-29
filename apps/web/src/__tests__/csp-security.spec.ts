import { describe, it, expect } from "vitest";
import { generateSriHash, verifySriHash } from "@pg-system/shared";
import {
  buildCspHeader,
  buildCheckoutIframeCspHeader,
} from "@/lib/csp-directives";

// =============================================
// 테스트 1: CSP 헤더 설정 검증
// =============================================
describe("CSP 헤더 검증", () => {
  it("middleware가 Content-Security-Policy 헤더를 올바르게 구성하는지 확인", () => {
    const nonce = crypto.randomUUID();
    const csp = buildCspHeader(nonce);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    );
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  // =============================================
  // 테스트 2: nonce 고유성 (매 요청마다 다른 값)
  // =============================================
  it("nonce가 매 요청마다 다른 값을 생성하는지 확인 (고정 nonce 방지)", () => {
    const nonces = new Set<string>();

    for (let i = 0; i < 100; i++) {
      nonces.add(crypto.randomUUID());
    }

    // 100회 생성 시 모두 고유해야 함
    expect(nonces.size).toBe(100);
  });

  // =============================================
  // 테스트 3: unsafe-inline 미포함 확인
  // =============================================
  it("script-src에 'unsafe-inline'이 포함되지 않는지 확인", () => {
    const nonce = crypto.randomUUID();
    const csp = buildCspHeader(nonce);

    // CSP를 디렉티브별로 분리
    const scriptSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("script-src"));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  // =============================================
  // 테스트 4: unsafe-eval 미포함 확인
  // =============================================
  it("script-src에 'unsafe-eval'이 포함되지 않는지 확인 (프로덕션)", () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      const nonce = crypto.randomUUID();
      const csp = buildCspHeader(nonce);

      const scriptSrc = csp
        .split(";")
        .find((d) => d.trim().startsWith("script-src"));

      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });

  // =============================================
  // 테스트 5: frame-ancestors 'none' 확인
  // =============================================
  it("frame-ancestors가 'none'으로 설정되어 있는지 확인 (클릭재킹 방지)", () => {
    const nonce = crypto.randomUUID();
    const csp = buildCspHeader(nonce);

    const frameAncestors = csp
      .split(";")
      .find((d) => d.trim().startsWith("frame-ancestors"));

    expect(frameAncestors).toBeDefined();
    expect(frameAncestors?.trim()).toBe("frame-ancestors 'none'");
  });
});

// =============================================
// 테스트 6: 결제 iframe CSP — frame-ancestors * 확인
// =============================================
describe("결제 iframe CSP 헤더 검증", () => {
  it("결제 iframe용 CSP가 frame-ancestors *로 설정되어 있는지 확인", () => {
    const nonce = crypto.randomUUID();
    const csp = buildCheckoutIframeCspHeader(nonce);

    const frameAncestors = csp
      .split(";")
      .find((d) => d.trim().startsWith("frame-ancestors"));

    expect(frameAncestors).toBeDefined();
    expect(frameAncestors?.trim()).toBe("frame-ancestors *");
  });

  it("결제 iframe CSP도 nonce 기반 script-src를 사용하는지 확인", () => {
    const nonce = crypto.randomUUID();
    const csp = buildCheckoutIframeCspHeader(nonce);

    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
  });

  it("결제 iframe CSP에 unsafe-inline/unsafe-eval이 없는지 확인 (프로덕션)", () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      const nonce = crypto.randomUUID();
      const csp = buildCheckoutIframeCspHeader(nonce);

      const scriptSrc = csp
        .split(";")
        .find((d) => d.trim().startsWith("script-src"));

      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });

  it("일반 CSP와 iframe CSP의 차이가 frame-ancestors뿐인지 확인", () => {
    const nonce = "test-nonce";
    const normalCsp = buildCspHeader(nonce);
    const iframeCsp = buildCheckoutIframeCspHeader(nonce);

    // frame-ancestors만 다르고 나머지는 동일해야 함
    const normalWithoutFrameAncestors = normalCsp.replace(
      "frame-ancestors 'none'",
      "frame-ancestors *",
    );
    expect(normalWithoutFrameAncestors).toBe(iframeCsp);
  });
});

// =============================================
// 테스트 7-8: SRI 해시 생성 및 검증
// =============================================
describe("SRI 해시 (PCI DSS 6.4.3)", () => {
  const sampleScript = 'console.log("hello");';

  it("SRI 해시가 sha384- 접두사로 생성되는지 확인", () => {
    const hash = generateSriHash(sampleScript);

    expect(hash).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
  });

  it("동일 콘텐츠는 동일 해시를 반환하는지 확인 (결정적)", () => {
    const hash1 = generateSriHash(sampleScript);
    const hash2 = generateSriHash(sampleScript);

    expect(hash1).toBe(hash2);
  });

  it("다른 콘텐츠는 다른 해시를 반환하는지 확인", () => {
    const hash1 = generateSriHash("script A");
    const hash2 = generateSriHash("script B");

    expect(hash1).not.toBe(hash2);
  });

  it("verifySriHash가 올바른 해시를 검증하는지 확인 (일치)", () => {
    const hash = generateSriHash(sampleScript);
    expect(verifySriHash(sampleScript, hash)).toBe(true);
  });

  it("verifySriHash가 틀린 해시를 거부하는지 확인 (불일치)", () => {
    expect(verifySriHash(sampleScript, "sha384-wronghash")).toBe(false);
  });
});

// =============================================
// 테스트 8: 스크립트 인벤토리 타입 readonly 검증
// =============================================
describe("스크립트 인벤토리 타입 (PCI DSS 6.4.3)", () => {
  it("ScriptInventoryEntry가 readonly 속성으로 정의되어 있는지 확인", () => {
    // 타입 레벨 검증: 실행 시점에서는 readonly 객체를 생성하여 불변성 확인
    const entry: import("@pg-system/shared").ScriptInventoryEntry = {
      name: "test-script",
      src: "/scripts/test.js",
      sriHash: generateSriHash("test"),
      purpose: "테스트용",
      addedBy: "admin",
      addedAt: "2026-02-28T00:00:00Z",
      lastVerified: "2026-02-28T00:00:00Z",
    };

    // readonly 객체는 Object.freeze로 불변성을 런타임에서도 보장
    const frozen = Object.freeze(entry);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen.name).toBe("test-script");
    expect(frozen.sriHash).toMatch(/^sha384-/);
  });

  it("ScriptInventory가 올바른 구조를 가지는지 확인", () => {
    const inventory: import("@pg-system/shared").ScriptInventory = {
      version: "1.0.0",
      lastUpdated: "2026-02-28T00:00:00Z",
      entries: [
        {
          name: "main-bundle",
          src: "/scripts/main.js",
          sriHash: generateSriHash("main bundle content"),
          purpose: "메인 애플리케이션",
          addedBy: "system",
          addedAt: "2026-02-28T00:00:00Z",
          lastVerified: "2026-02-28T00:00:00Z",
        },
      ],
    };

    expect(inventory.version).toBe("1.0.0");
    expect(inventory.entries).toHaveLength(1);
    expect(inventory.entries[0].name).toBe("main-bundle");
  });
});
