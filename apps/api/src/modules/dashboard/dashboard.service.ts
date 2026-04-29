import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

/**
 * @description 대시보드 통계 서비스. 거래·정산·입금 현황 및 트렌드 데이터를 집계하여 제공.
 * 8개 핵심 지표를 단일 트랜잭션으로 조회하여 데이터 정합성 보장.
 * @security PCI DSS 10.6 - 시스템 활동 모니터링용 통계 데이터 제공
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @description 대시보드 요약 지표 조회. 가맹점/대리점 수, 거래 건수·금액, 정산·입금 금액,
   * 미처리 정산 건수, 미매칭 입금 건수 등 8개 지표를 단일 트랜잭션으로 병렬 집계.
   * @param {DashboardQueryDto} query - 기간 필터 (startDate, endDate)
   * @returns {Promise<Object>} 대시보드 요약 객체 (BigInt 금액은 문자열로 변환)
   */
  async getSummary(query: DashboardQueryDto) {
    const dateFilter = this.buildDateFilter(query);
    const ownerFilter = await this.buildOwnershipFilter(query);
    const settlementDateFilter =
      query.startDate !== undefined && query.endDate !== undefined
        ? {
            settlement_date: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {};

    const [
      totalMerchants,
      totalAgents,
      transactionCount,
      transactionAmountAgg,
      settlementAmountAgg,
      depositAmountAgg,
      pendingSettlementCount,
      unmatchedDepositCount,
    ] = await this.prisma.$transaction([
      this.prisma.merchants.count({
        where: {
          deleted_at: null,
          ...(query.merchantId ? { id: query.merchantId } : {}),
          ...(query.agentId ? { agent_id: query.agentId } : {}),
        },
      }),
      this.prisma.agents.count({
        where: {
          deleted_at: null,
          ...(query.agentId ? { id: query.agentId } : {}),
        },
      }),
      this.prisma.transactions.count({
        where: { status: "APPROVED", ...dateFilter, ...ownerFilter },
      }),
      this.prisma.transactions.aggregate({
        where: { status: "APPROVED", ...dateFilter, ...ownerFilter },
        _sum: { amount: true },
      }),
      this.prisma.settlements.aggregate({
        where: {
          status: { in: ["CONFIRMED", "REMITTED", "COMPLETED"] },
          ...settlementDateFilter,
          ...ownerFilter,
        },
        _sum: { payout_amount: true },
      }),
      this.prisma.deposits.aggregate({
        where: settlementDateFilter.settlement_date
          ? {
              deposit_date: {
                gte: settlementDateFilter.settlement_date.gte,
                lte: settlementDateFilter.settlement_date.lte,
              },
            }
          : {},
        _sum: { amount: true },
      }),
      this.prisma.settlements.count({
        where: { status: "CALCULATED", ...ownerFilter },
      }),
      this.prisma.deposits.count({
        where: { reconcile_status: { in: ["PENDING", "MISMATCHED"] }, ...ownerFilter },
      }),
    ]);

    return {
      totalMerchants,
      totalAgents,
      transactionCount,
      totalTransactionAmount:
        transactionAmountAgg._sum.amount?.toString() ?? "0",
      totalSettlementAmount:
        settlementAmountAgg._sum.payout_amount?.toString() ?? "0",
      totalDepositAmount: depositAmountAgg._sum.amount?.toString() ?? "0",
      pendingSettlementCount,
      unmatchedDepositCount,
    };
  }

  /**
   * @description 거래 통계 — 상태별·결제수단별 건수 및 금액 집계.
   * @param {DashboardQueryDto} query - 기간 필터
   * @returns {Promise<{byStatus: Array, byPaymentMethod: Array}>} 상태별/결제수단별 통계
   */
  async getTransactionStats(query: DashboardQueryDto) {
    const dateFilter = this.buildDateFilter(query);
    const ownerFilter = await this.buildOwnershipFilter(query);

    const [statusStats, methodStats] = await Promise.all([
      this.prisma.transactions.groupBy({
        by: ["status"],
        where: { ...dateFilter, ...ownerFilter },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transactions.groupBy({
        by: ["payment_method"],
        where: { status: "APPROVED", ...dateFilter, ...ownerFilter },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      byStatus: statusStats.map((s) => ({
        status: s.status,
        count: s._count.id,
        totalAmount: s._sum.amount?.toString() ?? "0",
      })),
      byPaymentMethod: methodStats.map((s) => ({
        paymentMethod: s.payment_method,
        count: s._count.id,
        totalAmount: s._sum.amount?.toString() ?? "0",
      })),
    };
  }

  /**
   * @description 정산 통계 — 상태별 건수 및 총 순금액 집계.
   * @param {DashboardQueryDto} query - 기간 필터 (settlement_date 기준)
   * @returns {Promise<Array<{status, count, totalNetAmount}>>} 정산 상태별 통계
   */
  async getSettlementStats(query: DashboardQueryDto) {
    const ownerFilter = await this.buildOwnershipFilter(query);
    const settlementWhere =
      query.startDate !== undefined && query.endDate !== undefined
        ? {
            settlement_date: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {};

    const stats = await this.prisma.settlements.groupBy({
      by: ["status"],
      where: { ...settlementWhere, ...ownerFilter },
      _count: { id: true },
      _sum: { total_net: true },
    });

    return stats.map((s) => ({
      status: s.status,
      count: s._count.id,
      totalNetAmount: s._sum.total_net?.toString() ?? "0",
    }));
  }

  /**
   * @description 일별 거래 트렌드 조회. 승인 거래의 날짜별 건수·금액을 Raw SQL로 집계.
   * 기간 미지정 시 최근 30일 데이터 반환.
   * @param {DashboardQueryDto} query - 기간 필터
   * @returns {Promise<Array<{date, count, amount}>>} 일별 거래 트렌드 (Prisma.sql 파라미터화 쿼리 사용)
   * @security SQL Injection 방지 — Prisma.sql 템플릿 리터럴로 파라미터 바인딩
   */
  async getDailyTrend(query: DashboardQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const ownerFilter = await this.buildOwnershipFilter(query);
    const merchantIds = ownerFilter.merchant_id
      ? typeof ownerFilter.merchant_id === "string"
        ? [ownerFilter.merchant_id]
        : (ownerFilter.merchant_id as { in: string[] }).in
      : null;

    const ownerClause =
      merchantIds !== null && merchantIds.length > 0
        ? Prisma.sql`AND merchant_id IN (${Prisma.join(merchantIds)})`
        : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      { date: Date; count: bigint; amount: bigint }[]
    >(
      Prisma.sql`
        SELECT
          DATE(approved_at) AS date,
          COUNT(*) AS count,
          SUM(amount) AS amount
        FROM transactions
        WHERE status = 'APPROVED'
          AND approved_at >= ${startDate}
          AND approved_at <= ${endDate}
          ${ownerClause}
        GROUP BY DATE(approved_at)
        ORDER BY date ASC
      `,
    );

    return rows.map((r) => ({
      date:
        r.date instanceof Date
          ? r.date.toISOString().split("T")[0]
          : String(r.date),
      count: Number(r.count),
      amount: r.amount.toString(),
    }));
  }

  /**
   * @description 거래 금액 기준 상위 가맹점 조회. 승인 거래를 가맹점별로 그룹핑 후 금액 내림차순 정렬.
   * @param {DashboardQueryDto} query - 기간 필터
   * @param {number} limit - 조회 건수 (기본값 10)
   * @returns {Promise<Array<{merchantId, merchantName, merchantCode, totalAmount, transactionCount}>>}
   */
  async getTopMerchants(query: DashboardQueryDto, limit = 10) {
    const dateFilter = this.buildDateFilter(query);
    const ownerFilter = await this.buildOwnershipFilter(query);

    const grouped = await this.prisma.transactions.groupBy({
      by: ["merchant_id"],
      where: { status: "APPROVED", ...dateFilter, ...ownerFilter },
      _count: { id: true },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: limit,
    });

    if (grouped.length === 0) return [];

    const merchantIds = grouped.map((g) => g.merchant_id);
    const merchants = await this.prisma.merchants.findMany({
      where: { id: { in: merchantIds } },
      select: { id: true, merchant_code: true, merchant_name: true },
    });

    const merchantMap = new Map(merchants.map((m) => [m.id, m]));

    return grouped.map((g) => {
      const merchant = merchantMap.get(g.merchant_id);
      return {
        merchantId: g.merchant_id,
        merchantName: merchant?.merchant_name ?? "",
        merchantCode: merchant?.merchant_code ?? "",
        totalAmount: g._sum.amount?.toString() ?? "0",
        transactionCount: g._count.id,
      };
    });
  }

  /**
   * @description 수수료 기준 상위 대리점 조회. 대리점별 정산 수수료 합계 내림차순 정렬.
   * @param {DashboardQueryDto} query - 기간 필터 (settlement_date 기준)
   * @param {number} limit - 조회 건수 (기본값 10)
   * @returns {Promise<Array<{agentId, agentName, agentCode, totalCommission, settlementCount}>>}
   */
  async getTopAgents(query: DashboardQueryDto, limit = 10) {
    const settlementDateFilter =
      query.startDate !== undefined && query.endDate !== undefined
        ? {
            settlement_date: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {};

    const grouped = await this.prisma.agent_settlements.groupBy({
      by: ["agent_id"],
      where: {
        ...settlementDateFilter,
        ...(query.agentId ? { agent_id: query.agentId } : {}),
      },
      _sum: { total_commission: true },
      _count: { id: true },
      orderBy: { _sum: { total_commission: "desc" } },
      take: limit,
    });

    if (grouped.length === 0) return [];

    const agentIds = grouped.map((g) => g.agent_id);
    const agents = await this.prisma.agents.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, agent_code: true, agent_name: true },
    });

    const agentMap = new Map(agents.map((a) => [a.id, a]));

    return grouped.map((g) => {
      const agent = agentMap.get(g.agent_id);
      return {
        agentId: g.agent_id,
        agentName: agent?.agent_name ?? "",
        agentCode: agent?.agent_code ?? "",
        totalCommission: g._sum.total_commission?.toString() ?? "0",
        settlementCount: g._count.id,
      };
    });
  }

  /** approved_at 기간 필터 생성 헬퍼. startDate/endDate 미지정 시 빈 객체 반환. */
  private buildDateFilter(query: DashboardQueryDto) {
    if (query.startDate !== undefined && query.endDate !== undefined) {
      return {
        approved_at: {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate),
        },
      };
    }
    return {};
  }

  /**
   * merchantId/agentId 기반 소유권 필터 생성.
   * MERCHANT 유저: merchant_id = merchantId
   * AGENT 유저: merchant_id IN (소속 가맹점 IDs)
   * ADMIN: 필터 없음 (전체 조회)
   */
  private async buildOwnershipFilter(
    query: DashboardQueryDto,
  ): Promise<{ merchant_id?: string | { in: string[] } }> {
    if (query.merchantId) {
      return { merchant_id: query.merchantId };
    }
    if (query.agentId) {
      const merchants = await this.prisma.merchants.findMany({
        where: { agent_id: query.agentId, deleted_at: null },
        select: { id: true },
      });
      return { merchant_id: { in: merchants.map((m) => m.id) } };
    }
    return {};
  }
}
