import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { IntegrityMonitorService } from "../integrity-monitor.service";
import { PrismaService } from "../../../prisma/prisma.service";

// ---- Mock Prisma ----
const mockPrisma = {
  audit_logs: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

// ---- 테스트용 임시 디렉토리 ----
const TEST_DIR = join(__dirname, "__fim_test_tmp__");
const TEST_FILE_A = "test-file-a.txt";
const TEST_FILE_B = "test-file-b.txt";

describe("IntegrityMonitorService", () => {
  let service: IntegrityMonitorService;

  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(join(TEST_DIR, TEST_FILE_A), "hello world");
    await writeFile(join(TEST_DIR, TEST_FILE_B), "another file");
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrityMonitorService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) =>
              key === "app.projectRoot" ? TEST_DIR : fallback,
          },
        },
      ],
    }).compile();

    service = module.get<IntegrityMonitorService>(IntegrityMonitorService);
  });

  // ---- 1. computeFileHash가 SHA-256 해시를 반환하는지 (64자 hex) ----
  it("computeFileHash는 64자 hex SHA-256 해시를 반환한다", async () => {
    const hash = await service.computeFileHash(TEST_FILE_A);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  // ---- 2. 같은 파일은 같은 해시 반환 (결정적) ----
  it("같은 파일에 대해 동일한 해시를 반환한다 (결정적)", async () => {
    const hash1 = await service.computeFileHash(TEST_FILE_A);
    const hash2 = await service.computeFileHash(TEST_FILE_A);
    expect(hash1).toBe(hash2);
  });

  // ---- 3. 다른 내용이면 다른 해시 반환 ----
  it("다른 내용의 파일은 서로 다른 해시를 반환한다", async () => {
    const hashA = await service.computeFileHash(TEST_FILE_A);
    const hashB = await service.computeFileHash(TEST_FILE_B);
    expect(hashA).not.toBe(hashB);
  });

  // ---- 4. 존재하지 않는 파일 → 에러 ----
  it("존재하지 않는 파일 접근 시 에러를 던진다", async () => {
    await expect(
      service.computeFileHash("non-existent-file.txt"),
    ).rejects.toThrow();
  });

  // ---- 5. scanFiles가 여러 파일 해시를 배열로 반환 ----
  it("scanFiles는 여러 파일의 해시 레코드 배열을 반환한다", async () => {
    const records = await service.scanFiles([TEST_FILE_A, TEST_FILE_B]);
    expect(records).toHaveLength(2);
    expect(records[0].filePath).toBe(TEST_FILE_A);
    expect(records[0].algorithm).toBe("sha256");
    expect(records[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof records[0].fileSize).toBe("number");
    expect(records[1].filePath).toBe(TEST_FILE_B);
  });

  // ---- 6. checkIntegrity — 베이스라인과 동일하면 PASS ----
  it("checkIntegrity — 베이스라인과 동일하면 PASS를 반환한다", async () => {
    // 베이스라인 준비: 현재 파일과 같은 해시
    const currentRecords = await service.scanFiles([TEST_FILE_A]);

    mockPrisma.audit_logs.findFirst.mockResolvedValue({
      id: "baseline-1",
      action: "FIM_BASELINE",
      resource_type: "INTEGRITY",
      detail: currentRecords,
      created_at: new Date(),
    });

    // CRITICAL_PATHS 대신 테스트 파일 사용 — scanFiles를 mock
    const scanSpy = jest
      .spyOn(service, "scanFiles")
      .mockResolvedValue(currentRecords);

    const result = await service.checkIntegrity();
    expect(result.status).toBe("PASS");
    expect(result.changedFiles).toHaveLength(0);
    expect(result.deletedFiles).toHaveLength(0);

    scanSpy.mockRestore();
  });

  // ---- 7. checkIntegrity — 파일 변경 시 FAIL + changedFiles 상세 ----
  it("checkIntegrity — 파일 변경 시 FAIL과 changedFiles를 반환한다", async () => {
    const oldRecords = await service.scanFiles([TEST_FILE_A]);
    const modifiedRecords = oldRecords.map((r) => ({
      ...r,
      hash: "modified_hash_0000000000000000000000000000000000000000000000000000000000",
    }));

    mockPrisma.audit_logs.findFirst.mockResolvedValue({
      id: "baseline-2",
      action: "FIM_BASELINE",
      resource_type: "INTEGRITY",
      detail: modifiedRecords,
      created_at: new Date(),
    });

    const scanSpy = jest
      .spyOn(service, "scanFiles")
      .mockResolvedValue(oldRecords);
    mockPrisma.audit_logs.create.mockResolvedValue({});

    const result = await service.checkIntegrity();
    expect(result.status).toBe("FAIL");
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].filePath).toBe(TEST_FILE_A);

    scanSpy.mockRestore();
  });

  // ---- 8. checkIntegrity — 파일 삭제 시 deletedFiles에 포함 ----
  it("checkIntegrity — 삭제된 파일이 deletedFiles에 포함된다", async () => {
    const baselineWithExtra = [
      {
        filePath: TEST_FILE_A,
        algorithm: "sha256" as const,
        hash: "aaa",
        fileSize: 11,
        lastModified: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
      {
        filePath: "deleted-file.txt",
        algorithm: "sha256" as const,
        hash: "bbb",
        fileSize: 5,
        lastModified: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    ];

    mockPrisma.audit_logs.findFirst.mockResolvedValue({
      id: "baseline-3",
      action: "FIM_BASELINE",
      resource_type: "INTEGRITY",
      detail: baselineWithExtra,
      created_at: new Date(),
    });

    const currentRecords = [
      {
        filePath: TEST_FILE_A,
        algorithm: "sha256" as const,
        hash: "aaa",
        fileSize: 11,
        lastModified: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    ];

    const scanSpy = jest
      .spyOn(service, "scanFiles")
      .mockResolvedValue(currentRecords);
    mockPrisma.audit_logs.create.mockResolvedValue({});

    const result = await service.checkIntegrity();
    expect(result.status).toBe("FAIL");
    expect(result.deletedFiles).toContain("deleted-file.txt");

    scanSpy.mockRestore();
  });

  // ---- 9. updateBaseline — audit_logs에 FIM_BASELINE 기록 ----
  it("updateBaseline은 audit_logs에 FIM_BASELINE으로 기록한다", async () => {
    mockPrisma.audit_logs.create.mockResolvedValue({});

    const scanSpy = jest.spyOn(service, "scanFiles").mockResolvedValue([
      {
        filePath: TEST_FILE_A,
        algorithm: "sha256" as const,
        hash: "test-hash",
        fileSize: 11,
        lastModified: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    ]);

    await service.updateBaseline("test-admin-id");

    expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "FIM_BASELINE",
        resource_type: "INTEGRITY",
        user_id: "test-admin-id",
      }),
    });

    scanSpy.mockRestore();
  });

  // ---- 10. FIM_ALERT가 audit_logs에 기록되는지 ----
  it("파일 변경 탐지 시 FIM_ALERT가 audit_logs에 기록된다", async () => {
    const baselineRecords = [
      {
        filePath: TEST_FILE_A,
        algorithm: "sha256" as const,
        hash: "old-hash-value-00000000000000000000000000000000000000000000000000000",
        fileSize: 11,
        lastModified: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    ];

    const currentRecords = [
      {
        filePath: TEST_FILE_A,
        algorithm: "sha256" as const,
        hash: "new-hash-value-00000000000000000000000000000000000000000000000000000",
        fileSize: 11,
        lastModified: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    ];

    mockPrisma.audit_logs.findFirst.mockResolvedValue({
      id: "baseline-4",
      action: "FIM_BASELINE",
      resource_type: "INTEGRITY",
      detail: baselineRecords,
      created_at: new Date(),
    });

    const scanSpy = jest
      .spyOn(service, "scanFiles")
      .mockResolvedValue(currentRecords);
    mockPrisma.audit_logs.create.mockResolvedValue({});

    await service.checkIntegrity();

    expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "FIM_ALERT",
        resource_type: "INTEGRITY",
      }),
    });

    scanSpy.mockRestore();
  });

  // ---- 11. scanFiles — 존재하지 않는 파일은 건너뛴다 (에러 삼키지 않음) ----
  it("scanFiles는 존재하지 않는 파일을 건너뛰고 접근 가능한 파일만 반환한다", async () => {
    const records = await service.scanFiles([
      TEST_FILE_A,
      "non-existent-file.txt",
      TEST_FILE_B,
    ]);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.filePath)).toEqual([TEST_FILE_A, TEST_FILE_B]);
  });

  // ---- 12. getBaseline — 베이스라인이 없으면 빈 배열 ----
  it("getBaseline — 베이스라인이 없으면 빈 배열을 반환한다", async () => {
    mockPrisma.audit_logs.findFirst.mockResolvedValue(null);
    const baseline = await service.getBaseline();
    expect(baseline).toEqual([]);
  });
});
