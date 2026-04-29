import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { LocalKmsService } from "../kms/local-kms.service";

// 테스트용 64자 hex 키 (256-bit)
const TEST_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const mockConfigService = {
  get: jest.fn(),
};

describe("LocalKmsService", () => {
  let service: LocalKmsService;

  beforeEach(async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === "encryption.key") return TEST_ENCRYPTION_KEY;
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalKmsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LocalKmsService>(LocalKmsService);
    jest.clearAllMocks();
    // onModuleInit 호출 전 mock 재설정
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === "encryption.key") return TEST_ENCRYPTION_KEY;
      return undefined;
    });
  });

  // ================================================================
  // encrypt → decrypt 왕복 검증
  // ================================================================
  it("encrypt → decrypt 왕복 시 원본을 복원한다", async () => {
    const plaintext = Buffer.from("민감한 결제 데이터", "utf-8");

    const ciphertext = await service.encrypt(plaintext, "key-1");
    const decrypted = await service.decrypt(ciphertext, "key-1");

    expect(decrypted.toString("utf-8")).toBe("민감한 결제 데이터");
    expect(ciphertext).not.toEqual(plaintext);
  });

  // ================================================================
  // 다른 키로 복호화 시 실패
  // ================================================================
  it("다른 ENCRYPTION_KEY면 복호화에 실패한다", async () => {
    const plaintext = Buffer.from("test data", "utf-8");
    const ciphertext = await service.encrypt(plaintext, "key-1");

    // 다른 키로 변경
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === "encryption.key")
        return "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
      return undefined;
    });

    await expect(service.decrypt(ciphertext, "key-1")).rejects.toThrow();
  });

  // ================================================================
  // generateDataKey
  // ================================================================
  it("generateDataKey가 plaintext와 ciphertext를 반환한다", async () => {
    const result = await service.generateDataKey("key-1");

    expect(result.plaintext).toBeInstanceOf(Buffer);
    expect(result.ciphertext).toBeInstanceOf(Buffer);
    expect(result.plaintext).toHaveLength(32); // 256-bit
    expect(result.ciphertext.length).toBeGreaterThan(32); // iv + authTag + encrypted
  });

  // ================================================================
  // 빈 데이터 암호화
  // ================================================================
  it("빈 데이터도 암호화/복호화할 수 있다", async () => {
    const plaintext = Buffer.alloc(0);

    const ciphertext = await service.encrypt(plaintext, "key-1");
    const decrypted = await service.decrypt(ciphertext, "key-1");

    expect(decrypted).toEqual(plaintext);
  });

  // ================================================================
  // ENCRYPTION_KEY 미설정 시 에러
  // ================================================================
  it("ENCRYPTION_KEY 미설정 시 에러를 던진다", async () => {
    mockConfigService.get.mockImplementation(() => undefined);

    await expect(
      service.encrypt(Buffer.from("test"), "key-1"),
    ).rejects.toThrow("ENCRYPTION_KEY 환경변수가 설정되지 않았습니다");
  });

  // ================================================================
  // rotateKey
  // ================================================================
  it("rotateKey가 새로운 UUID를 반환한다", async () => {
    const newKeyId = await service.rotateKey("old-key-1");

    expect(newKeyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  // ================================================================
  // onModuleInit 유효성 검증
  // ================================================================
  it("onModuleInit에서 키 길이가 64자가 아니면 에러를 던진다", () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === "encryption.key") return "short-key";
      return undefined;
    });

    expect(() => service.onModuleInit()).toThrow(
      "ENCRYPTION_KEY must be a 64-character hex string",
    );
  });
});
