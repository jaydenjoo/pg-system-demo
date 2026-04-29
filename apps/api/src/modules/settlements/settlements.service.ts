import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  PAGINATION,
  SETTLEMENT_STATUS,
  TRANSACTION_STATUS,
} from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { SETTLEMENT_QUEUE } from "./settlement.processor";
import { SettlementListQueryDto } from "./dto/settlement-list-query.dto";
import { CalculateSettlementDto } from "./dto/calculate-settlement.dto";
import { AgentSettlementQueryDto } from "./dto/agent-settlement-query.dto";

/**
 * @description 정산(Settlement) 관리 서비스.
 * 가맹점 정산과 대리점 정산을 처리. 거래 집계 및 정산 계산, 확정, 완료.
 * PCI DSS 10.x (Audit Trail for settlement processing) 준수:
 * 정산 계산 과정 및 상태 변경의 완전한 감시 추적
 * @security PCI DSS 10.2.2 - 금융 거래(정산) 처리 이력 기록 필수
 * @security PCI DSS 10.2.6 - 정산 상태 변경 기록
 * @audit 모든 정산 생성/변경 시 created_by/updated_by로 누가 처리했는지 기록
 */
@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    @InjectQueue(SETTLEMENT_QUEUE) private readonly settlementQueue: Queue,
  ) {}

  /** 정산 큐 상태 조회 — 관리자용 모니터링 */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.settlementQueue.getWaitingCount(),
        this.settlementQueue.getActiveCount(),
        this.settlementQueue.getCompletedCount(),
        this.settlementQueue.getFailedCount(),
      ]);
      return { waiting, active, completed, failed };
    } catch {
      // Redis 미연결 시 기본값 반환
      return { waiting: 0, active: 0, completed: 0, failed: 0 };
    }
  }

  /**
   * @description 정산 목록을 페이지네이션과 함께 조회.
   * 가맹점, 대리점, 상태, 날짜로 필터링 가능.
   * @param {SettlementListQueryDto} query - 페이지, 한도, 필터 조건들
   * @returns {Promise<{data: Array, meta: {total, page, limit, totalPages}}>} 정산 목록 및 메타정보
   * @security PCI DSS 10.2.2 - 정산 정보 조회
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async findAll(query: SettlementListQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      ...(query.merchantId !== undefined
        ? { merchant_id: query.merchantId }
        : {}),
      ...(query.agentId !== undefined
        ? { merchants: { agent_id: query.agentId } }
        : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.startDate !== undefined && query.endDate !== undefined
        ? {
            settlement_date: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.settlements.findMany({
        where,
        skip,
        take: limit,
        orderBy: { settlement_date: "desc" },
        include: {
          merchants: {
            select: { merchant_name: true, merchant_code: true },
          },
        },
      }),
      this.prisma.settlements.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * @description 특정 정산의 상세 정보 조회.
   * @param {string} id - 정산 ID
   * @returns {Promise<Settlement>} 정산 상세 정보
   * @security PCI DSS 10.2.2 - 정산 정보 접근 제어
   * @audit 존재하지 않는 정산 접근 시도는 NotFoundException으로 감지
   */
  async findOne(id: string) {
    const settlement = await this.prisma.settlements.findUnique({
      where: { id },
      include: {
        merchants: {
          select: {
            id: true,
            merchant_name: true,
            merchant_code: true,
            status: true,
          },
        },
      },
    });

    if (!settlement) {
      throw new NotFoundException({
        code: ERROR_CODES.STL_001,
        message: "정산을 찾을 수 없습니다",
      });
    }

    return settlement;
  }

  /**
   * @description 특정 기간의 거래를 집계하여 정산을 계산.
   * 가맹점별 정산과 대리점 정산을 동시 생성. 중복 정산일 방지.
   * 트랜잭션으로 가맹점/대리점 정산을 원자적으로 생성하여 부분 실패 방지.
   * @param {CalculateSettlementDto} dto - 정산일, 기간(periodFrom, periodTo)
   * @param {string} createdBy - 정산 계산자 ID (감사 추적용)
   * @returns {Promise<{merchantSettlements: number, agentSettlements: number}>} 생성된 정산 건수
   * @security PCI DSS 10.2.2 - 정산 계산 과정 및 금액 기록
   * @security PCI DSS 10.2.4 - 관리자의 권한 있는 정산 계산 기록 (createdBy)
   * @audit 정산 계산자, 계산 시간, 대상 거래 기간 기록 (created_by, settlement_date, period_from/to)
   */
  async calculate(
    dto: CalculateSettlementDto,
    createdBy: string,
  ): Promise<{ merchantSettlements: number; agentSettlements: number }> {
    const settlementDate = new Date(dto.settlementDate);
    const periodFrom = new Date(dto.periodFrom);
    // periodTo를 해당 일자의 끝(23:59:59.999)으로 설정하여 하루 전체를 포함
    const periodTo = new Date(dto.periodTo);
    periodTo.setUTCHours(23, 59, 59, 999);

    // 중복 정산일 체크
    const existingCount = await this.prisma.settlements.count({
      where: { settlement_date: settlementDate },
    });
    if (existingCount > 0) {
      throw new ConflictException({
        code: ERROR_CODES.STL_002,
        message: "해당 일자 정산이 이미 존재합니다",
      });
    }

    // 기간 내 승인 거래 조회 (select로 필요 컬럼만)
    const transactions = await this.prisma.transactions.findMany({
      where: {
        status: TRANSACTION_STATUS.APPROVED,
        approved_at: { gte: periodFrom, lte: periodTo },
      },
      select: {
        id: true,
        merchant_id: true,
        amount: true,
        fee_amount: true,
        tran_type: true,
      },
    });

    if (transactions.length === 0) {
      return { merchantSettlements: 0, agentSettlements: 0 };
    }

    // 관련 가맹점 agent_id 일괄 조회 (N+1 → 2쿼리)
    const merchantIds = [...new Set(transactions.map((t) => t.merchant_id))];
    const merchants = await this.prisma.merchants.findMany({
      where: { id: { in: merchantIds } },
      select: { id: true, agent_id: true },
    });
    const merchantAgentMap = new Map(
      merchants.map((m) => [m.id, m.agent_id]),
    );

    // 가맹점별 그룹핑
    const merchantGroups = new Map<
      string,
      { txns: typeof transactions; agentId: string }
    >();
    for (const txn of transactions) {
      const mid = txn.merchant_id;
      if (!merchantGroups.has(mid)) {
        merchantGroups.set(mid, {
          txns: [],
          agentId: merchantAgentMap.get(mid) ?? "",
        });
      }
      merchantGroups.get(mid)!.txns.push(txn);
    }

    // 가맹점 정산 데이터 생성
    const settlementRows: {
      merchant_id: string;
      settlement_date: Date;
      period_from: Date;
      period_to: Date;
      total_amount: bigint;
      total_fee: bigint;
      total_net: bigint;
      deduction: bigint;
      payout_amount: bigint;
      tran_count: number;
      cancel_count: number;
      created_by: string;
    }[] = [];

    const agentTotals = new Map<
      string,
      { commission: bigint; count: number }
    >();

    for (const [merchantId, { txns, agentId }] of merchantGroups) {
      const totalAmount = txns.reduce((s, t) => s + t.amount, BigInt(0));
      const totalFee = txns.reduce((s, t) => s + t.fee_amount, BigInt(0));
      const totalNet = totalAmount - totalFee;
      const tranCount = txns.filter((t) => t.tran_type === "PAYMENT").length;
      const cancelCount = txns.filter((t) => t.tran_type === "CANCEL").length;

      settlementRows.push({
        merchant_id: merchantId,
        settlement_date: settlementDate,
        period_from: periodFrom,
        period_to: periodTo,
        total_amount: totalAmount,
        total_fee: totalFee,
        total_net: totalNet,
        deduction: BigInt(0),
        payout_amount: totalNet,
        tran_count: tranCount,
        cancel_count: cancelCount,
        created_by: createdBy,
      });

      const agentEntry = agentTotals.get(agentId) ?? {
        commission: BigInt(0),
        count: 0,
      };
      agentTotals.set(agentId, {
        commission: agentEntry.commission + totalFee,
        count: agentEntry.count + tranCount,
      });
    }

    // 대리점 정산 데이터 생성
    const agentRows = Array.from(agentTotals.entries()).map(
      ([agentId, { commission, count }]) => ({
        agent_id: agentId,
        settlement_date: settlementDate,
        period_from: periodFrom,
        period_to: periodTo,
        total_commission: commission,
        tran_count: count,
        created_by: createdBy,
      }),
    );

    // 가맹점·대리점 정산을 원자적으로 생성 (부분 실패 방지)
    await this.prisma.$transaction(async (tx) => {
      await tx.settlements.createMany({ data: settlementRows });
      await tx.agent_settlements.createMany({ data: agentRows });
    });

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.SETTLEMENT_CREATE,
      resourceType: 'settlement',
      detail: { settlementDate: dto.settlementDate, merchantCount: settlementRows.length, agentCount: agentRows.length },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return {
      merchantSettlements: settlementRows.length,
      agentSettlements: agentRows.length,
    };
  }

  /**
   * @description 계산된 정산을 확정. CALCULATED 상태에서만 CONFIRMED로 변경 가능.
   * @param {string} id - 정산 ID
   * @param {string} updatedBy - 확정자 ID (감사 추적용)
   * @returns {Promise<Settlement>} 확정된 정산 정보
   * @security PCI DSS 10.2.6 - 정산 상태 변경 기록
   * @audit 정산 확정자 및 확정 시간 기록 (updated_by, updated_at)
   */
  async confirm(id: string, updatedBy: string) {
    const settlement = await this.findOne(id);

    if (settlement.status !== SETTLEMENT_STATUS.CALCULATED) {
      throw new ConflictException({
        code: ERROR_CODES.STL_002,
        message: "계산된 정산만 확정할 수 있습니다",
      });
    }

    const confirmed = await this.prisma.settlements.update({
      where: { id },
      data: {
        status: SETTLEMENT_STATUS.CONFIRMED,
        updated_by: updatedBy,
      },
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.SETTLEMENT_CONFIRMED,
      resourceType: 'settlement',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return confirmed;
  }

  /**
   * @description 확정된 정산을 완료 (송금 실행). CONFIRMED 상태에서만 REMITTED로 변경 가능.
   * remitted_at에 완료 시간 기록.
   * @param {string} id - 정산 ID
   * @param {string} updatedBy - 완료 처리자 ID (감사 추적용)
   * @returns {Promise<Settlement>} 완료된 정산 정보
   * @security PCI DSS 10.2.2 - 정산 송금 실행 기록 필수
   * @security PCI DSS 10.2.6 - 정산 최종 상태 변경 기록
   * @audit 정산 완료자, 완료 시간, 송금 시간 기록 (updated_by, remitted_at)
   */
  async complete(id: string, updatedBy: string) {
    const settlement = await this.findOne(id);

    if (settlement.status !== SETTLEMENT_STATUS.CONFIRMED) {
      throw new ConflictException({
        code: ERROR_CODES.STL_002,
        message: "확정된 정산만 완료할 수 있습니다",
      });
    }

    const completed = await this.prisma.settlements.update({
      where: { id },
      data: {
        status: SETTLEMENT_STATUS.REMITTED,
        remitted_at: new Date(),
        updated_by: updatedBy,
      },
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.SETTLEMENT_COMPLETED,
      resourceType: 'settlement',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return completed;
  }

  /**
   * @description 대리점 정산 목록을 페이지네이션과 함께 조회.
   * 대리점, 상태, 날짜로 필터링 가능.
   * @param {AgentSettlementQueryDto} query - 페이지, 한도, 필터 조건들
   * @returns {Promise<{data: Array, meta: {total, page, limit, totalPages}}>} 대리점 정산 목록
   * @security PCI DSS 10.2.2 - 대리점 정산 정보 조회
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async getAgentSettlements(query: AgentSettlementQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      ...(query.agentId !== undefined ? { agent_id: query.agentId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.startDate !== undefined && query.endDate !== undefined
        ? {
            settlement_date: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.agent_settlements.findMany({
        where,
        skip,
        take: limit,
        orderBy: { settlement_date: "desc" },
        include: {
          agents: { select: { agent_name: true, agent_code: true } },
        },
      }),
      this.prisma.agent_settlements.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * @description 특정 대리점 정산의 상세 정보 조회.
   * @param {string} id - 대리점 정산 ID
   * @returns {Promise<AgentSettlement>} 대리점 정산 상세 정보
   * @security PCI DSS 10.2.2 - 대리점 정산 정보 접근 제어
   * @audit 존재하지 않는 정산 접근 시도는 NotFoundException으로 감지
   */
  async getAgentSettlementDetail(id: string) {
    const settlement = await this.prisma.agent_settlements.findUnique({
      where: { id },
      include: {
        agents: { select: { id: true, agent_name: true, agent_code: true } },
      },
    });

    if (!settlement) {
      throw new NotFoundException({
        code: ERROR_CODES.STL_001,
        message: "대리점 정산을 찾을 수 없습니다",
      });
    }

    return settlement;
  }
}
