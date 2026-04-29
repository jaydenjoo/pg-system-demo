import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ERROR_CODES,
  PAGINATION,
  SETTLEMENT_CYCLES,
  MerchantStatusCode,
  AUDIT_ACTIONS,
  maskBankAccount,
} from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { MerchantListQueryDto } from "./dto/merchant-list-query.dto";

const MERCHANT_LIST_SELECT = {
  id: true,
  merchant_code: true,
  merchant_name: true,
  status: true,
  settlement_cycle: true,
  contract_start_date: true,
  contract_end_date: true,
  bank_name: true,
  bank_account: true,
  bank_holder: true,
  created_at: true,
  created_by: true,
  updated_at: true,
  updated_by: true,
  companies: {
    select: {
      id: true,
      company_name: true,
      business_no: true,
      representative: true,
    },
  },
  agents: {
    select: {
      id: true,
      agent_code: true,
      agent_name: true,
    },
  },
} as const;

/**
 * @description 가맹점(Merchant) 관리 서비스. 가맹점 생성, 조회, 수정, 상태 관리 기능 제공.
 * PCI DSS 12.8 (Third-Party Management) 준수: 가맹점 정보의 안전한 관리 및 접근 제어
 * @security PCI DSS 12.8.1 - 가맹점 정보의 기밀성 및 무결성 보호
 * @audit 모든 가맹점 생성/수정 시 created_by/updated_by로 누가 변경했는지 기록
 */
@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  /**
   * @description 가맹점 목록을 페이지네이션과 함께 조회. 대리점/상태/검색어로 필터링 가능.
   * @param {MerchantListQueryDto} query - 페이지, 한도, 대리점ID, 상태, 검색어 포함
   * @returns {Promise<{data: Array, meta: {total, page, limit, totalPages}}>} 가맹점 목록 및 메타정보
   * @security PCI DSS 3.2.1 - 계좌번호는 마스킹처리 후 반환
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async findAll(query: MerchantListQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      deleted_at: null,
      ...(query.agentId !== undefined ? { agent_id: query.agentId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.search !== undefined
        ? {
            merchant_name: {
              contains: query.search,
              mode: "insensitive" as const,
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.merchants.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: MERCHANT_LIST_SELECT,
      }),
      this.prisma.merchants.count({ where }),
    ]);

    return {
      data: rows.map((m) => ({
        ...m,
        bank_account: maskBankAccount(m.bank_account),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * @description 새로운 가맹점을 생성. 중복 코드 체크 및 대리점 유효성 검증.
   * @param {CreateMerchantDto} dto - 가맹점 코드, 이름, 대리점ID, 정산주기, 계좌정보 등
   * @param {string} createdBy - 생성자 ID (감사 추적용)
   * @returns {Promise<Merchant>} 생성된 가맹점 정보 (계좌번호는 마스킹됨)
   * @security PCI DSS 12.8 - 가맹점 정보의 무결성 보호 (중복 코드 방지)
   * @audit 가맹점 생성자 기록 (created_by)
   */
  /**
   * @description 가맹점 코드 자동 채번. M + YYYYMMDD + 3자리 순번.
   * @returns {Promise<string>} 생성된 가맹점 코드 (예: M20260301001)
   */
  private async generateMerchantCode(): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const prefix = `M${yyyy}${mm}${dd}`;

    const count = await this.prisma.merchants.count({
      where: { merchant_code: { startsWith: prefix } },
    });

    return `${prefix}${String(count + 1).padStart(3, "0")}`;
  }

  async create(dto: CreateMerchantDto, createdBy: string) {
    const agent = await this.prisma.agents.findFirst({
      where: { id: dto.agentId, deleted_at: null },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException({
        code: ERROR_CODES.AGENT_001,
        message: "대리점을 찾을 수 없습니다",
      });
    }

    const merchantCode = await this.generateMerchantCode();
    const companyId = randomUUID();

    const [, merchant] = await this.prisma.$transaction([
      this.prisma.companies.create({
        data: {
          id: companyId,
          business_no: dto.businessNo,
          company_name: dto.merchantName,
          representative: dto.representative ?? dto.merchantName,
          business_type: dto.businessType ?? "소매업",
          created_by: createdBy,
          updated_by: createdBy,
        },
      }),
      this.prisma.merchants.create({
        data: {
          company_id: companyId,
          agent_id: dto.agentId,
          merchant_code: merchantCode,
          merchant_name: dto.merchantName,
          settlement_cycle: dto.settlementCycle ?? SETTLEMENT_CYCLES.D2,
          contract_start_date: dto.contractStartDate ?? null,
          contract_end_date: dto.contractEndDate ?? null,
          bank_name: dto.bankName ?? null,
          bank_account: dto.bankAccount ?? null,
          bank_holder: dto.bankHolder ?? null,
          created_by: createdBy,
          updated_by: createdBy,
        },
        select: MERCHANT_LIST_SELECT,
      }),
    ]);

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.MERCHANT_CREATE,
      resourceType: 'merchant',
      resourceId: merchant.id,
      detail: { merchantCode: merchant.merchant_code, merchantName: merchant.merchant_name },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return {
      ...merchant,
      bank_account: maskBankAccount(merchant.bank_account),
    };
  }

  /**
   * @description 특정 가맹점의 상세 정보 조회. 단말기, 수수료율 정보 포함.
   * @param {string} id - 가맹점 ID
   * @returns {Promise<Merchant>} 가맹점 상세 정보 (계좌번호는 마스킹됨)
   * @security PCI DSS 3.2.1 - 계좌번호 마스킹 처리
   * @audit 존재하지 않는 가맹점 접근 시도는 NotFoundException으로 감지
   */
  async findOne(id: string) {
    const merchant = await this.prisma.merchants.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        merchant_code: true,
        merchant_name: true,
        status: true,
        settlement_cycle: true,
        contract_start_date: true,
        contract_end_date: true,
        bank_name: true,
        bank_account: true,
        bank_holder: true,
        created_at: true,
        created_by: true,
        updated_at: true,
        updated_by: true,
        companies: {
          select: {
            id: true,
            company_name: true,
            business_no: true,
            representative: true,
          },
        },
        agents: {
          select: {
            id: true,
            agent_code: true,
            agent_name: true,
          },
        },
        merchant_terminals: {
          where: { deleted_at: null },
          select: {
            id: true,
            tid: true,
            terminal_name: true,
            payment_method: true,
            status: true,
          },
        },
        merchant_commissions: {
          where: { effective_to: null },
          select: {
            id: true,
            payment_method: true,
            card_company: true,
            commission_rate: true,
            effective_from: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException({
        code: ERROR_CODES.MERCHANT_001,
        message: "가맹점을 찾을 수 없습니다",
      });
    }

    return {
      ...merchant,
      bank_account: maskBankAccount(merchant.bank_account),
    };
  }

  /**
   * @description 가맹점 정보를 부분 업데이트. 계약기간, 정산주기, 계좌정보 등 변경 가능.
   * @param {string} id - 가맹점 ID
   * @param {UpdateMerchantDto} dto - 업데이트할 필드들 (부분 업데이트 가능)
   * @param {string} updatedBy - 수정자 ID (감사 추적용)
   * @returns {Promise<Merchant>} 업데이트된 가맹점 정보 (계좌번호는 마스킹됨)
   * @security PCI DSS 12.8 - 가맹점 정보 변경 시 감시
   * @audit 수정자 및 수정 시간 기록 (updated_by, updated_at)
   */
  async update(id: string, dto: UpdateMerchantDto, updatedBy: string) {
    await this.findOne(id);
    const merchant = await this.prisma.merchants.update({
      where: { id },
      data: {
        ...(dto.merchantName !== undefined
          ? { merchant_name: dto.merchantName }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.settlementCycle !== undefined
          ? { settlement_cycle: dto.settlementCycle }
          : {}),
        ...(dto.bankName !== undefined ? { bank_name: dto.bankName } : {}),
        ...(dto.bankAccount !== undefined
          ? { bank_account: dto.bankAccount }
          : {}),
        ...(dto.bankHolder !== undefined
          ? { bank_holder: dto.bankHolder }
          : {}),
        updated_by: updatedBy,
      },
      select: MERCHANT_LIST_SELECT,
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.MERCHANT_UPDATE,
      resourceType: 'merchant',
      resourceId: id,
      detail: { changes: { ...dto } },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return {
      ...merchant,
      bank_account: maskBankAccount(merchant.bank_account),
    };
  }

  /**
   * @description 가맹점 상태를 변경 (활성/비활성 등).
   * @param {string} id - 가맹점 ID
   * @param {MerchantStatusCode} status - 변경할 상태 코드 (ACTIVE, INACTIVE, SUSPENDED 등)
   * @param {string} updatedBy - 변경자 ID (감사 추적용)
   * @returns {Promise<Merchant>} 상태 변경된 가맹점 정보
   * @security PCI DSS 12.8 - 가맹점 접근 제어 상태 변경
   * @audit 상태 변경자 및 변경 시간 기록
   */
  async changeStatus(
    id: string,
    status: MerchantStatusCode,
    updatedBy: string,
  ) {
    await this.findOne(id);
    const merchant = await this.prisma.merchants.update({
      where: { id },
      data: { status, updated_by: updatedBy },
      select: MERCHANT_LIST_SELECT,
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.MERCHANT_STATUS_CHANGE,
      resourceType: 'merchant',
      resourceId: id,
      detail: { status },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return {
      ...merchant,
      bank_account: maskBankAccount(merchant.bank_account),
    };
  }

  /**
   * @description 가맹점을 소프트 삭제 (실제 삭제 아님, deleted_at 마크).
   * @param {string} id - 가맹점 ID
   * @param {string} updatedBy - 삭제자 ID (감사 추적용)
   * @returns {Promise<void>}
   * @security PCI DSS 10.2.7 - 데이터 삭제 기록
   * @audit 삭제자 및 삭제 시간 기록 (deleted_at, updated_by)
   */
  async remove(id: string, updatedBy: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.merchants.update({
      where: { id },
      data: { deleted_at: new Date(), updated_by: updatedBy },
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.MERCHANT_DELETE,
      resourceType: 'merchant',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));
  }
}
