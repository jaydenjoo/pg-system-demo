import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, ERROR_CODES, CACHE_TTL } from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { SetAgentCommissionDto } from "./dto/set-agent-commission.dto";
import { SetMerchantCommissionDto } from "./dto/set-merchant-commission.dto";
import { SetPgMarginDto } from "./dto/set-pg-margin.dto";
import { CommissionQueryDto } from "./dto/commission-query.dto";

/**
 * @description 수수료(Commission) 관리 서비스.
 * PG 기본 마진, 대리점 수수료, 가맹점 수수료의 계층적 관리.
 * PCI DSS 10.x (Audit Trail for financial calculations) 준수:
 * 수수료 계산 및 변경 이력 완전 추적
 * @security PCI DSS 10.2.2 - 금융 계산(수수료) 변경 이력 기록 필수
 * @security PCI DSS 10.2.4 - 관리자의 권한 있는 접근 기록
 * @audit 모든 수수료 설정 시 created_by 및 effective_from/effective_to로 버전 관리
 */
@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly security: SecurityService,
  ) {}

  /**
   * @description PG 기본 마진 정보 조회. 현재 유효한 것만 또는 전체 히스토리 조회 가능.
   * @param {CommissionQueryDto} query - 현재만(currentOnly), 결제수단, 카드사로 필터링
   * @returns {Promise<PgMargin[]>} PG 기본 마진 목록
   * @security PCI DSS 10.2.2 - 마진 정보는 감시 대상
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async getPgMargins(query: CommissionQueryDto = {}) {
    const isCurrent = query.currentOnly !== false;
    let result;

    if (isCurrent) {
      const paymentMethod = query.paymentMethod ?? "ALL";
      const cardCompany = query.cardCompany ?? "ALL";
      const cacheKey = `commissions:pg:${paymentMethod}:${cardCompany}`;

      result = await this.cache.get<typeof this.prisma.pg_default_margins>(
        cacheKey,
      );
      if (result) return result;
    }

    const where = {
      ...(isCurrent ? { effective_to: null } : {}),
      ...(query.paymentMethod !== undefined
        ? { payment_method: query.paymentMethod }
        : {}),
      ...(query.cardCompany !== undefined
        ? { card_company: query.cardCompany }
        : {}),
    };

    result = await this.prisma.pg_default_margins.findMany({
      where,
      orderBy: { payment_method: "asc" },
    });

    if (isCurrent) {
      const paymentMethod = query.paymentMethod ?? "ALL";
      const cardCompany = query.cardCompany ?? "ALL";
      const cacheKey = `commissions:pg:${paymentMethod}:${cardCompany}`;
      await this.cache.set(cacheKey, result, CACHE_TTL.COMMISSIONS);
    }

    return result;
  }

  /**
   * @description PG 기본 마진을 설정. 기존 활성 마진은 자동으로 만료(expire) 처리.
   * 트랜잭션으로 원자적 처리하여 부분 실패 방지.
   * @param {SetPgMarginDto} dto - 결제수단, 카드사, 마진율, 최소 수수료
   * @param {string} createdBy - 설정자 ID (감사 추적용)
   * @returns {Promise<PgMargin>} 새로 설정된 PG 마진 정보
   * @security PCI DSS 10.2.2 - 마진율 변경은 완전하게 기록되어야 함 (effective_from/to)
   * @security PCI DSS 10.2.4 - 관리자의 권한 있는 접근 기록 (createdBy)
   * @audit 마진율 변경자 및 변경 시간 기록 (created_by, effective_from, 기존 레코드의 effective_to)
   */
  async setPgMargin(dto: SetPgMarginDto, createdBy: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Expire existing active margin for same paymentMethod + cardCompany
      await tx.pg_default_margins.updateMany({
        where: {
          payment_method: dto.paymentMethod,
          card_company: dto.cardCompany ?? null,
          effective_to: null,
        },
        data: { effective_to: new Date() },
      });

      return tx.pg_default_margins.create({
        data: {
          payment_method: dto.paymentMethod,
          card_company: dto.cardCompany ?? null,
          margin_rate: dto.marginRate,
          min_fee: BigInt(dto.minFee ?? 0),
          effective_from: new Date(),
          created_by: createdBy,
        },
      });
    });

    const cardCompany = dto.cardCompany ?? "ALL";
    await this.cache.del(`commissions:pg:${dto.paymentMethod}:${cardCompany}`);
    await this.cache.del("commissions:pg:ALL:ALL");

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.COMMISSION_CREATE,
      resourceType: 'pg_margin',
      resourceId: result.id,
      detail: { paymentMethod: dto.paymentMethod, cardCompany: dto.cardCompany, marginRate: dto.marginRate },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return result;
  }

  /**
   * @description 특정 대리점의 수수료 정보 조회. 현재 유효한 것만 또는 전체 히스토리 조회 가능.
   * @param {string} agentId - 대리점 ID
   * @param {CommissionQueryDto} query - 현재만(currentOnly), 결제수단, 카드사로 필터링
   * @returns {Promise<AgentCommission[]>} 대리점 수수료 목록
   * @security PCI DSS 10.2.2 - 대리점 수수료는 감시 대상
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async getAgentCommissions(agentId: string, query: CommissionQueryDto = {}) {
    const isCurrent = query.currentOnly !== false;
    let result;

    if (isCurrent) {
      const paymentMethod = query.paymentMethod ?? "ALL";
      const cacheKey = `commissions:agent:${agentId}:${paymentMethod}`;

      result = await this.cache.get<typeof this.prisma.agent_commissions>(
        cacheKey,
      );
      if (result) return result;
    }

    const where = {
      agent_id: agentId,
      ...(isCurrent ? { effective_to: null } : {}),
      ...(query.paymentMethod !== undefined
        ? { payment_method: query.paymentMethod }
        : {}),
      ...(query.cardCompany !== undefined
        ? { card_company: query.cardCompany }
        : {}),
    };

    result = await this.prisma.agent_commissions.findMany({
      where,
      orderBy: { payment_method: "asc" },
    });

    if (isCurrent) {
      const paymentMethod = query.paymentMethod ?? "ALL";
      const cacheKey = `commissions:agent:${agentId}:${paymentMethod}`;
      await this.cache.set(cacheKey, result, CACHE_TTL.COMMISSIONS);
    }

    return result;
  }

  /**
   * @description 대리점 수수료를 설정. PG 마진 >= 대리점 수수료 계층 검증 필수.
   * 기존 활성 수수료는 자동으로 만료 처리. 트랜잭션으로 원자적 처리.
   * @param {string} agentId - 대리점 ID
   * @param {SetAgentCommissionDto} dto - 결제수단, 카드사, 수수료율
   * @param {string} createdBy - 설정자 ID (감사 추적용)
   * @returns {Promise<AgentCommission>} 새로 설정된 대리점 수수료 정보
   * @security PCI DSS 10.2.2 - 수수료율 변경 완전 기록 (effective_from/to)
   * @security PCI DSS 10.2.4 - 관리자의 권한 있는 접근 기록 (createdBy)
   * @audit 수수료 변경자, 변경 시간, 계층 검증 기록 (created_by, effective_from)
   */
  async setAgentCommission(
    agentId: string,
    dto: SetAgentCommissionDto,
    createdBy: string,
  ) {
    const agent = await this.prisma.agents.findUnique({
      where: { id: agentId },
    });
    if (!agent) {
      throw new NotFoundException({
        code: ERROR_CODES.AGENT_001,
        message: "대리점을 찾을 수 없습니다",
      });
    }

    // 수수료 계층 검증: agent commission >= PG margin
    const pgMargin = await this.prisma.pg_default_margins.findFirst({
      where: {
        payment_method: dto.paymentMethod,
        card_company: dto.cardCompany ?? null,
        effective_to: null,
      },
    });

    if (pgMargin !== null) {
      const pgRate = Number(pgMargin.margin_rate);
      const agentRate = Number(dto.commissionRate);
      if (agentRate < pgRate) {
        throw new BadRequestException({
          code: ERROR_CODES.STL_003,
          message:
            "수수료 계층 검증 실패: 대리점 수수료는 PG 마진 이상이어야 합니다",
        });
      }
    }

    // Expire-and-create를 원자적으로 수행
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.agent_commissions.updateMany({
        where: {
          agent_id: agentId,
          payment_method: dto.paymentMethod,
          card_company: dto.cardCompany ?? null,
          effective_to: null,
        },
        data: { effective_to: new Date() },
      });

      return tx.agent_commissions.create({
        data: {
          agent_id: agentId,
          payment_method: dto.paymentMethod,
          card_company: dto.cardCompany ?? null,
          commission_rate: dto.commissionRate,
          effective_from: new Date(),
          created_by: createdBy,
        },
      });
    });

    await this.cache.del(`commissions:agent:${agentId}:${dto.paymentMethod}`);
    await this.cache.del(`commissions:agent:${agentId}:ALL`);

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.COMMISSION_CREATE,
      resourceType: 'agent_commission',
      resourceId: result.id,
      detail: { agentId, paymentMethod: dto.paymentMethod, commissionRate: dto.commissionRate },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return result;
  }

  /**
   * @description 특정 가맹점의 수수료 정보 조회. 현재 유효한 것만 또는 전체 히스토리 조회 가능.
   * @param {string} merchantId - 가맹점 ID
   * @param {CommissionQueryDto} query - 현재만(currentOnly), 결제수단, 카드사로 필터링
   * @returns {Promise<MerchantCommission[]>} 가맹점 수수료 목록
   * @security PCI DSS 10.2.2 - 가맹점 수수료는 감시 대상
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async getMerchantCommissions(
    merchantId: string,
    query: CommissionQueryDto = {},
  ) {
    const isCurrent = query.currentOnly !== false;
    let result;

    if (isCurrent) {
      const paymentMethod = query.paymentMethod ?? "ALL";
      const cacheKey = `commissions:merchant:${merchantId}:${paymentMethod}`;

      result = await this.cache.get<typeof this.prisma.merchant_commissions>(
        cacheKey,
      );
      if (result) return result;
    }

    const where = {
      merchant_id: merchantId,
      ...(isCurrent ? { effective_to: null } : {}),
      ...(query.paymentMethod !== undefined
        ? { payment_method: query.paymentMethod }
        : {}),
      ...(query.cardCompany !== undefined
        ? { card_company: query.cardCompany }
        : {}),
    };

    result = await this.prisma.merchant_commissions.findMany({
      where,
      orderBy: { payment_method: "asc" },
    });

    if (isCurrent) {
      const paymentMethod = query.paymentMethod ?? "ALL";
      const cacheKey = `commissions:merchant:${merchantId}:${paymentMethod}`;
      await this.cache.set(cacheKey, result, CACHE_TTL.COMMISSIONS);
    }

    return result;
  }

  /**
   * @description 가맹점 수수료를 설정. 대리점 수수료 >= 가맹점 수수료 계층 검증 필수.
   * 기존 활성 수수료는 자동으로 만료 처리. 트랜잭션으로 원자적 처리.
   * @param {string} merchantId - 가맹점 ID
   * @param {SetMerchantCommissionDto} dto - 결제수단, 카드사, 수수료율
   * @param {string} createdBy - 설정자 ID (감사 추적용)
   * @returns {Promise<MerchantCommission>} 새로 설정된 가맹점 수수료 정보
   * @security PCI DSS 10.2.2 - 수수료율 변경 완전 기록 (effective_from/to)
   * @security PCI DSS 10.2.4 - 관리자의 권한 있는 접근 기록 (createdBy)
   * @audit 수수료 변경자, 변경 시간, 계층 검증 기록 (created_by, effective_from)
   */
  async setMerchantCommission(
    merchantId: string,
    dto: SetMerchantCommissionDto,
    createdBy: string,
  ) {
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) {
      throw new NotFoundException({
        code: ERROR_CODES.MERCHANT_001,
        message: "가맹점을 찾을 수 없습니다",
      });
    }

    // 수수료 계층 검증: merchant commission >= agent commission
    const agentCommission = await this.prisma.agent_commissions.findFirst({
      where: {
        agent_id: merchant.agent_id,
        payment_method: dto.paymentMethod,
        card_company: dto.cardCompany ?? null,
        effective_to: null,
      },
    });

    if (agentCommission !== null) {
      const agentRate = Number(agentCommission.commission_rate);
      const merchantRate = Number(dto.commissionRate);
      if (merchantRate < agentRate) {
        throw new BadRequestException({
          code: ERROR_CODES.STL_003,
          message:
            "수수료 계층 검증 실패: 가맹점 수수료는 대리점 수수료 이상이어야 합니다",
        });
      }
    }

    // Expire-and-create를 원자적으로 수행
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.merchant_commissions.updateMany({
        where: {
          merchant_id: merchantId,
          payment_method: dto.paymentMethod,
          card_company: dto.cardCompany ?? null,
          effective_to: null,
        },
        data: { effective_to: new Date() },
      });

      return tx.merchant_commissions.create({
        data: {
          merchant_id: merchantId,
          payment_method: dto.paymentMethod,
          card_company: dto.cardCompany ?? null,
          commission_rate: dto.commissionRate,
          effective_from: new Date(),
          created_by: createdBy,
        },
      });
    });

    await this.cache.del(`commissions:merchant:${merchantId}:${dto.paymentMethod}`);
    await this.cache.del(`commissions:merchant:${merchantId}:ALL`);

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.COMMISSION_CREATE,
      resourceType: 'merchant_commission',
      resourceId: result.id,
      detail: { merchantId, paymentMethod: dto.paymentMethod, commissionRate: dto.commissionRate },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return result;
  }

  /**
   * @description 대리점 또는 가맹점의 수수료 변경 이력 조회.
   * effective_from/to를 통해 버전 관리된 전체 히스토리 조회 가능.
   * @param {string} entityType - "agent" 또는 "merchant"
   * @param {string} entityId - 대리점 또는 가맹점 ID
   * @param {string} paymentMethod - 특정 결제수단만 조회 (선택사항)
   * @returns {Promise<{entityType, entityId, data: Commission[]}>} 수수료 변경 이력
   * @security PCI DSS 10.2.2 - 금융 계산(수수료) 변경 이력 완전 조회 가능
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async getCommissionHistory(
    entityType: "agent" | "merchant",
    entityId: string,
    paymentMethod?: string,
  ) {
    if (entityType === "agent") {
      const data = await this.prisma.agent_commissions.findMany({
        where: {
          agent_id: entityId,
          ...(paymentMethod !== undefined
            ? { payment_method: paymentMethod }
            : {}),
        },
        orderBy: { effective_from: "desc" },
      });
      return { entityType, entityId, data };
    }

    const data = await this.prisma.merchant_commissions.findMany({
      where: {
        merchant_id: entityId,
        ...(paymentMethod !== undefined
          ? { payment_method: paymentMethod }
          : {}),
      },
      orderBy: { effective_from: "desc" },
    });
    return { entityType, entityId, data };
  }
}
