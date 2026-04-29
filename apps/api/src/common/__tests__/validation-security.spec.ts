import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import * as fs from "fs";
import * as path from "path";
import { CreateUserDto } from "../../modules/users/dto/create-user.dto";
import { CreateMerchantDto } from "../../modules/merchants/dto/create-merchant.dto";
import { CreateAgentDto } from "../../modules/agents/dto/create-agent.dto";

describe("DTO Validation Security Tests", () => {
  // ---- 1. CreateUserDto 검증 ----
  describe("CreateUserDto 검증", () => {
    const validUser: Partial<CreateUserDto> = {
      loginId: "testuser01",
      name: "테스트유저",
      password: "Abcdef123456!",
      userType: "ADMIN" as const,
      email: "test@example.com",
    };

    it("email 형식 불일치 → 에러", async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUser,
        email: "not-an-email",
      });
      const errors = await validate(dto);
      const emailError = errors.find((e) => e.property === "email");
      expect(emailError).toBeDefined();
    });

    it("password 12자 미만 → 에러", async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUser,
        password: "Abc12345!ab", // 11자
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === "password");
      expect(pwError).toBeDefined();
    });

    it("password 12자 이상 + 영문/숫자/특수문자 → 통과", async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUser,
        password: "Abcdef123456!",
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === "password");
      expect(pwError).toBeUndefined();
    });

    it("name 빈 문자열 → 에러", async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUser,
        name: "",
      });
      const errors = await validate(dto);
      const nameError = errors.find((e) => e.property === "name");
      expect(nameError).toBeDefined();
    });

    it("loginId 빈 문자열 → 에러", async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUser,
        loginId: "",
      });
      const errors = await validate(dto);
      const loginIdError = errors.find((e) => e.property === "loginId");
      expect(loginIdError).toBeDefined();
    });
  });

  // ---- 2. CreateMerchantDto 검증 ----
  describe("CreateMerchantDto 검증", () => {
    const validMerchant: Partial<CreateMerchantDto> = {
      agentId: "550e8400-e29b-41d4-a716-446655440001",
      merchantName: "테스트가맹점",
      businessNo: "123-45-67890",
      settlementCycle: "D+1" as const,
    };

    it("merchantName 빈 문자열 → 에러", async () => {
      const dto = plainToInstance(CreateMerchantDto, {
        ...validMerchant,
        merchantName: "",
      });
      const errors = await validate(dto);
      const nameError = errors.find((e) => e.property === "merchantName");
      expect(nameError).toBeDefined();
    });

    it("settlementCycle 유효하지 않은 값 → 에러", async () => {
      const dto = plainToInstance(CreateMerchantDto, {
        ...validMerchant,
        settlementCycle: "INVALID_CYCLE",
      });
      const errors = await validate(dto);
      const cycleError = errors.find((e) => e.property === "settlementCycle");
      expect(cycleError).toBeDefined();
    });

    it("유효한 CreateMerchantDto → 통과", async () => {
      const dto = plainToInstance(CreateMerchantDto, validMerchant);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  // ---- 3. CreateAgentDto 검증 ----
  describe("CreateAgentDto 검증", () => {
    const validAgent: Partial<CreateAgentDto> = {
      agentName: "테스트대리점",
      businessNo: "123-45-67890",
    };

    it("agentName 빈 문자열 → 에러", async () => {
      const dto = plainToInstance(CreateAgentDto, {
        ...validAgent,
        agentName: "",
      });
      const errors = await validate(dto);
      const nameError = errors.find((e) => e.property === "agentName");
      expect(nameError).toBeDefined();
    });

    it("유효한 CreateAgentDto → 통과", async () => {
      const dto = plainToInstance(CreateAgentDto, validAgent);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  // ---- 4. SQL 인젝션 방어 확인 ----
  describe("SQL 인젝션 방어 확인", () => {
    const srcDir = path.resolve(__dirname, "../../modules");

    function collectTsFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...collectTsFiles(fullPath));
        } else if (
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".spec.ts") &&
          !entry.name.endsWith(".d.ts")
        ) {
          results.push(fullPath);
        }
      }
      return results;
    }

    it("소스 코드에서 $queryRawUnsafe 미사용 확인", () => {
      const files = collectTsFiles(srcDir);
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        expect(content).not.toContain("$queryRawUnsafe");
      }
    });

    it("소스 코드에서 $executeRawUnsafe 미사용 확인", () => {
      const files = collectTsFiles(srcDir);
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        expect(content).not.toContain("$executeRawUnsafe");
      }
    });

    it("$queryRaw 사용 시 Prisma.sql 태그드 템플릿 사용 확인", () => {
      const files = collectTsFiles(srcDir);
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        if (content.includes("$queryRaw")) {
          // $queryRaw 사용 시 반드시 Prisma.sql 태그드 템플릿 사용
          expect(content).toContain("Prisma.sql");
        }
      }
    });

    it("Prisma ORM 사용 확인 (PrismaService import 존재)", () => {
      const files = collectTsFiles(srcDir);
      const serviceFiles = files.filter((f) => f.endsWith(".service.ts"));
      expect(serviceFiles.length).toBeGreaterThan(0);

      let prismaImportCount = 0;
      for (const file of serviceFiles) {
        const content = fs.readFileSync(file, "utf-8");
        if (content.includes("PrismaService")) {
          prismaImportCount++;
        }
      }
      expect(prismaImportCount).toBeGreaterThan(0);
    });
  });
});
