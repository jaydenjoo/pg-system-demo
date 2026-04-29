import * as fs from "fs";
import * as path from "path";
import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { GlobalExceptionFilter } from "../filters/http-exception.filter";
import { maskBankAccount } from "@pg-system/shared";

// ---- GlobalExceptionFilter mock helpers ----

/**
 * GlobalExceptionFilter가 사용하는 switchToHttp().getResponse/getRequest만 구현.
 * 캐스팅은 팩토리 함수 내부에 캡슐화하여 호출부를 타입 안전하게 유지.
 */
function createMockHost(overrides?: { method?: string; url?: string }): {
  host: ArgumentsHost;
  mockStatus: jest.Mock;
  mockJson: jest.Mock;
} {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockResponse = { status: mockStatus, json: mockJson };
  const mockRequest = {
    method: overrides?.method ?? "GET",
    url: overrides?.url ?? "/test",
  };

  const partial: Pick<ArgumentsHost, "switchToHttp"> = {
    switchToHttp: () =>
      ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }) as ReturnType<ArgumentsHost["switchToHttp"]>,
  };

  return { host: partial as ArgumentsHost, mockStatus, mockJson };
}

describe("Data Masking Security Tests", () => {
  // ---- 1. bank_account masking ----
  describe("bank_account masking (maskBankAccount)", () => {
    it('maskBankAccount("1234567890") -> "****7890"', () => {
      expect(maskBankAccount("1234567890")).toBe("****7890");
    });

    it("maskBankAccount(null) -> null", () => {
      expect(maskBankAccount(null)).toBeNull();
    });

    it('maskBankAccount("1234") -> "****1234" (4자 이하도 동작)', () => {
      expect(maskBankAccount("1234")).toBe("****1234");
    });

    it('maskBankAccount("") -> null (빈 문자열은 null 반환)', () => {
      expect(maskBankAccount("")).toBeNull();
    });

    it("MerchantsService에서 maskBankAccount 사용 확인 (소스코드 검증)", () => {
      const merchantsServicePath = path.resolve(
        __dirname,
        "../../modules/merchants/merchants.service.ts",
      );
      const source = fs.readFileSync(merchantsServicePath, "utf-8");
      expect(source).toContain("maskBankAccount");
    });

    it("AgentsService에서도 동일한 maskBankAccount 사용 확인", () => {
      const agentsServicePath = path.resolve(
        __dirname,
        "../../modules/agents/agents.service.ts",
      );
      const source = fs.readFileSync(agentsServicePath, "utf-8");
      expect(source).toContain("maskBankAccount");
    });
  });

  // ---- 2. error response security (GlobalExceptionFilter) ----
  describe("GlobalExceptionFilter - error response security", () => {
    let filter: GlobalExceptionFilter;

    beforeEach(() => {
      filter = new GlobalExceptionFilter();
    });

    it("HttpException -> code + message만 반환, 스택트레이스 없음", () => {
      const { host, mockStatus, mockJson } = createMockHost();
      const exception = new HttpException(
        { code: "TEST_ERROR", message: "테스트 에러" },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const responseBody = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(responseBody).toEqual({
        success: false,
        error: { code: "TEST_ERROR", message: "테스트 에러" },
      });
      expect(JSON.stringify(responseBody)).not.toContain("stack");
    });

    it('일반 Error -> "내부 서버 오류가 발생했습니다" + INTERNAL_ERROR', () => {
      const { host, mockStatus, mockJson } = createMockHost();
      const exception = new Error("db connection failed");

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const responseBody = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(responseBody).toEqual({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "내부 서버 오류가 발생했습니다",
        },
      });
      expect(JSON.stringify(responseBody)).not.toContain(
        "db connection failed",
      );
    });

    it("에러 응답에 stack/query/table/column/constraint 필드 없음", () => {
      const { host, mockJson } = createMockHost();
      const exception = new Error("Something bad happened");

      filter.catch(exception, host);

      const responseStr = JSON.stringify(mockJson.mock.calls[0][0]);
      const forbiddenFields = [
        "stack",
        "query",
        "table",
        "column",
        "constraint",
      ];
      for (const field of forbiddenFields) {
        expect(responseStr).not.toContain(`"${field}"`);
      }
    });

    it("Prisma 에러도 일반 에러 메시지로 변환", () => {
      const { host, mockJson } = createMockHost();
      const prismaError = Object.assign(
        new Error("Unique constraint failed on fields: email"),
        { code: "P2002" },
      );

      filter.catch(prismaError, host);

      const responseBody = mockJson.mock.calls[0][0] as Record<string, unknown>;
      expect(responseBody).toEqual({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "내부 서버 오류가 발생했습니다",
        },
      });
      expect(JSON.stringify(responseBody)).not.toContain("Unique constraint");
      expect(JSON.stringify(responseBody)).not.toContain("email");
    });
  });

  // ---- 3. password_hash never returned ----
  describe("password_hash 미반환 검증", () => {
    const usersServicePath = path.resolve(
      __dirname,
      "../../modules/users/users.service.ts",
    );
    let source: string;

    beforeAll(() => {
      source = fs.readFileSync(usersServicePath, "utf-8");
    });

    it("UsersService.findAll select에 password_hash 미포함", () => {
      // findAll 메서드의 select 블록 추출
      const findAllMatch =
        /async findAll[\s\S]*?select:\s*\{([\s\S]*?)\}/m.exec(source);
      expect(findAllMatch).not.toBeNull();
      expect(findAllMatch![1]).not.toContain("password_hash");
    });

    it("UsersService.findById select에 password_hash 미포함", () => {
      // findById 메서드의 select 블록 추출
      const findByIdMatch =
        /async findById[\s\S]*?select:\s*\{([\s\S]*?)\}/m.exec(source);
      expect(findByIdMatch).not.toBeNull();
      expect(findByIdMatch![1]).not.toContain("password_hash");
    });
  });
});
