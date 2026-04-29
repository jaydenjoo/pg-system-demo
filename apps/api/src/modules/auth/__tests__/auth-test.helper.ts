import * as crypto from "crypto";

// ---- Test encryption key (32 bytes = 64 hex chars) ----
export const TEST_MFA_KEY_HEX =
  "a3c9f7e2b1d845690c3e12f8a7b5d4e6f9c2a1b0e8d7c6f5a4b3c2d1e0f9a8b7";

/** Encrypt a secret using the same AES-256-GCM format as AuthService */
export function encryptForTest(plaintext: string): string {
  const key = Buffer.from(TEST_MFA_KEY_HEX, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

// ---- Mock Factories ----
export function createMockPrisma() {
  const prisma = {
    users: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    user_mfa: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    user_roles: {
      findMany: jest.fn(),
    },
    refresh_tokens: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    login_history: {
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fn: unknown) => {
      if (typeof fn === "function") {
        return (fn as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.resolve();
    }),
  };
  return prisma;
}

export function createMockJwtService(): Record<string, jest.Mock> {
  return {
    sign: jest.fn().mockReturnValue("mock-jwt-token"),
    verify: jest.fn(),
  };
}

export function createMockCache() {
  return {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

export function createMockConfigService(): Record<string, jest.Mock> {
  return {
    get: jest.fn().mockReturnValue("test-secret"),
    getOrThrow: jest.fn((key: string) => {
      if (key === "encryption.mfaSecretKey") return TEST_MFA_KEY_HEX;
      if (key === "jwt.mfaSecret") return "test-mfa-secret";
      return "test-secret";
    }),
  };
}

export interface TestUser {
  id: string;
  login_id: string;
  password_hash: string;
  user_type: string;
  status: string;
  failed_login_count: number;
  locked_until: Date | null;
  user_mfa: Array<{
    mfa_type: string;
    is_verified: boolean;
    is_primary: boolean;
  }>;
}

export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  return {
    id: "user-uuid-1",
    login_id: "testuser",
    password_hash: "",
    user_type: "ADMIN",
    status: "ACTIVE",
    failed_login_count: 0,
    locked_until: null,
    user_mfa: [],
    ...overrides,
  };
}
