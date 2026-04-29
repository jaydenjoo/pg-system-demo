import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, ERROR_CODES, PAGINATION, TRANSACTION_STATUS } from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { DepositListQueryDto } from "./dto/deposit-list-query.dto";
import { CreateDepositDto } from "./dto/create-deposit.dto";
import { ManualMatchDto } from "./dto/manual-match.dto";

/**
 * @description 입금(Deposit) 관리 서비스.
 * 은행 입금 내역 기록 및 거래 매칭, 입금 재조정(Reconciliation) 처리.
 * PCI DSS 10.x (Audit Trail for deposit management) 준수:
 * 입금 데이터의 완전한 기록 유지 및 감사 추적
 * @security PCI DSS 10.2.1 - 입금 거래 기록 필수
 * @security PCI DSS 10.2.2 - 입금 매칭 및 수정 이력 기록
 * @audit 모든 입금 생성/수정 시 created_by/updated_by로 누가 처리했는지 기록
 */
@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  /**
   * @description 입금 내역 목록을 페이지네이션과 함께 조회.
   * 출처, 조정 상태, 날짜로 필터링 가능.
   * @param {DepositListQueryDto} query - 페이지, 한도, 필터 조건들
   * @returns {Promise<{data: Array, meta: {total, page, limit, totalPages}}>} 입금 목록 및 메타정보
   * @security PCI DSS 10.2.1 - 입금 정보 조회
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async findAll(query: DepositListQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      ...(query.source !== undefined ? { source: query.source } : {}),
      ...(query.reconcileStatus !== undefined
        ? { reconcile_status: query.reconcileStatus }
        : {}),
      ...(query.startDate !== undefined && query.endDate !== undefined
        ? {
            deposit_date: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.deposits.findMany({
        where,
        skip,
        take: limit,
        orderBy: { deposit_date: "desc" },
        select: {
          id: true,
          deposit_date: true,
          source: true,
          amount: true,
          matched_amount: true,
          unmatched_amount: true,
          reconcile_status: true,
          created_at: true,
          deposit_transactions: {
            select: {
              id: true,
              matched_amount: true,
              transaction_id: true,
              created_at: true,
              transactions: {
                select: { tran_no: true, amount: true },
              },
            },
          },
        },
      }),
      this.prisma.deposits.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * @description 특정 입금 내역의 상세 정보 조회. 매칭된 거래 정보 포함.
   * @param {string} id - 입금 ID
   * @returns {Promise<Deposit>} 입금 상세 정보 및 매칭 거래
   * @security PCI DSS 10.2.1 - 입금 정보 접근 제어
   * @audit 존재하지 않는 입금 접근 시도는 NotFoundException으로 감지
   */
  async findOne(id: string) {
    const deposit = await this.prisma.deposits.findUnique({
      where: { id },
      include: {
        deposit_transactions: {
          include: {
            transactions: {
              select: { tran_no: true, amount: true, merchant_id: true },
            },
          },
        },
      },
    });

    if (!deposit) {
      throw new NotFoundException({
        code: ERROR_CODES.STL_001,
        message: "입금 내역을 찾을 수 없습니다",
      });
    }

    return deposit;
  }

  /**
   * @description 새로운 입금 내역을 기록. 입금액을 매칭 대기액으로 초기화.
   * @param {CreateDepositDto} dto - 입금일, 출처(은행명 등), 입금액
   * @param {string} createdBy - 입금 기록자 ID (감사 추적용)
   * @returns {Promise<Deposit>} 생성된 입금 내역
   * @security PCI DSS 10.2.1 - 입금 거래 기록
   * @audit 입금 기록자 및 기록 시간 기록 (created_by, created_at)
   */
  async create(dto: CreateDepositDto, createdBy: string) {
    const amount = BigInt(dto.amount);
    const deposit = await this.prisma.deposits.create({
      data: {
        deposit_date: new Date(dto.depositDate),
        source: dto.source,
        amount,
        unmatched_amount: amount,
        created_by: createdBy,
      },
    });

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.DEPOSIT_CREATE,
      resourceType: 'deposit',
      resourceId: deposit.id,
      detail: { source: dto.source, amount: dto.amount },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return deposit;
  }

  /**
   * @description 입금을 자동 재조정(Reconciliation). 같은 날짜의 승인된 거래를 매칭.
   * 금액 내림차순으로 거래를 매칭하며, 남은 금액이 있으면 MISMATCHED 상태로 기록.
   * 트랜잭션으로 원자적 처리하여 부분 실패 방지.
   * @param {string} id - 입금 ID
   * @param {string} updatedBy - 재조정 처리자 ID (감사 추적용)
   * @returns {Promise<Deposit>} 재조정된 입금 정보 (reconcile_status 변경)
   * @security PCI DSS 10.2.2 - 입금 매칭 과정 기록
   * @audit 재조정자, 재조정 시간, 매칭 결과(MATCHED/MISMATCHED) 기록 (updated_by, reconcile_status)
   */
  async reconcile(id: string, updatedBy: string) {
    const deposit = await this.findOne(id);
    const depositDate = deposit.deposit_date;

    // 이미 매칭된 거래 ID 목록
    const alreadyMatchedIds = deposit.deposit_transactions.map(
      (dt) => dt.transaction_id,
    );

    // 같은 날짜의 APPROVED 거래 중 아직 매칭되지 않은 거래 조회
    // 로컬 날짜 기반으로 시작/종료 시점 계산 (toISOString UTC 변환에 의한 날짜 밀림 방지)
    const dayStart = new Date(
      depositDate.getFullYear(),
      depositDate.getMonth(),
      depositDate.getDate(),
      0,
      0,
      0,
      0,
    );
    const dayEnd = new Date(
      depositDate.getFullYear(),
      depositDate.getMonth(),
      depositDate.getDate(),
      23,
      59,
      59,
      999,
    );
    const unmatched = await this.prisma.transactions.findMany({
      where: {
        status: TRANSACTION_STATUS.APPROVED,
        approved_at: {
          gte: dayStart,
          lte: dayEnd,
        },
        ...(alreadyMatchedIds.length > 0
          ? { id: { notIn: alreadyMatchedIds } }
          : {}),
      },
      orderBy: { amount: "desc" },
    });

    let remaining = deposit.unmatched_amount;
    const matchRows: {
      deposit_id: string;
      transaction_id: string;
      matched_amount: bigint;
    }[] = [];

    for (const txn of unmatched) {
      if (remaining <= BigInt(0)) break;
      const matched = remaining >= txn.amount ? txn.amount : remaining;
      matchRows.push({
        deposit_id: id,
        transaction_id: txn.id,
        matched_amount: matched,
      });
      remaining -= matched;
    }

    const newMatchedTotal =
      deposit.matched_amount +
      matchRows.reduce((s, r) => s + r.matched_amount, BigInt(0));
    const newUnmatched = deposit.amount - newMatchedTotal;
    const newStatus = newUnmatched === BigInt(0) ? "MATCHED" : "MISMATCHED";

    const result = await this.prisma.$transaction(async (tx) => {
      if (matchRows.length > 0) {
        await tx.deposit_transactions.createMany({ data: matchRows });
      }
      return tx.deposits.update({
        where: { id },
        data: {
          matched_amount: newMatchedTotal,
          unmatched_amount: newUnmatched,
          reconcile_status: newStatus,
          updated_by: updatedBy,
        },
      });
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.DEPOSIT_RECONCILE,
      resourceType: 'deposit',
      resourceId: id,
      detail: { matchedCount: matchRows.length, status: newStatus },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return result;
  }

  /**
   * @description 입금을 특정 거래에 수동 매칭. 자동 매칭에 실패한 경우 사용.
   * 매칭 금액이 미매칭액을 초과하면 안 됨. 트랜잭션으로 원자적 처리.
   * @param {string} id - 입금 ID
   * @param {ManualMatchDto} dto - 거래 ID, 매칭 금액
   * @param {string} updatedBy - 수동 매칭자 ID (감사 추적용)
   * @returns {Promise<DepositTransaction>} 생성된 매칭 기록
   * @security PCI DSS 10.2.2 - 수동 매칭 이력 기록
   * @audit 매칭자, 매칭 시간, 매칭 금액, 참고 사항 기록 (updated_by, matched_amount)
   */
  async manualMatch(id: string, dto: ManualMatchDto, updatedBy: string) {
    const deposit = await this.findOne(id);
    const matchedAmount = BigInt(dto.matchedAmount);

    if (matchedAmount > deposit.unmatched_amount) {
      throw new BadRequestException({
        code: ERROR_CODES.STL_003,
        message: "매칭 금액이 미매칭 금액을 초과합니다",
      });
    }

    const newMatchedTotal = deposit.matched_amount + matchedAmount;
    const newUnmatched = deposit.amount - newMatchedTotal;
    const newStatus =
      newUnmatched === BigInt(0) ? "MANUAL" : deposit.reconcile_status;

    const depositTxn = await this.prisma.$transaction(async (tx) => {
      const dt = await tx.deposit_transactions.create({
        data: {
          deposit_id: id,
          transaction_id: dto.transactionId,
          matched_amount: matchedAmount,
        },
      });
      await tx.deposits.update({
        where: { id },
        data: {
          matched_amount: newMatchedTotal,
          unmatched_amount: newUnmatched,
          reconcile_status: newStatus,
          updated_by: updatedBy,
        },
      });
      return dt;
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.DEPOSIT_MANUAL_MATCH,
      resourceType: 'deposit',
      resourceId: id,
      detail: { transactionId: dto.transactionId, matchedAmount: dto.matchedAmount },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return depositTxn;
  }

  /**
   * @description 기존 입금-거래 매칭을 취소 (언매칭). 매칭 금액을 미매칭액으로 반환.
   * 트랜잭션으로 매칭 기록 삭제 및 입금 상태 업데이트를 원자적 처리.
   * @param {string} depositId - 입금 ID
   * @param {string} depositTransactionId - 매칭 기록 ID
   * @param {string} updatedBy - 언매칭 처리자 ID (감사 추적용)
   * @returns {Promise<void>}
   * @security PCI DSS 10.2.2 - 매칭 취소 이력 기록
   * @audit 언매칭자, 언매칭 시간, 원래 매칭 금액 기록 (updated_by, unmatched_amount 변경)
   */
  async unmatch(
    depositId: string,
    depositTransactionId: string,
    updatedBy: string,
  ) {
    const deposit = await this.findOne(depositId);

    const depositTxn = await this.prisma.deposit_transactions.findUnique({
      where: { id: depositTransactionId },
    });

    if (!depositTxn || depositTxn.deposit_id !== depositId) {
      throw new NotFoundException({
        code: ERROR_CODES.STL_001,
        message: "매칭 내역을 찾을 수 없습니다",
      });
    }

    const newMatchedTotal = deposit.matched_amount - depositTxn.matched_amount;
    const newUnmatched = deposit.amount - newMatchedTotal;

    await this.prisma.$transaction([
      this.prisma.deposit_transactions.delete({
        where: { id: depositTransactionId },
      }),
      this.prisma.deposits.update({
        where: { id: depositId },
        data: {
          matched_amount: newMatchedTotal,
          unmatched_amount: newUnmatched,
          reconcile_status: newUnmatched > BigInt(0) ? "PENDING" : "MATCHED",
          updated_by: updatedBy,
        },
      }),
    ]);

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.DEPOSIT_UNMATCH,
      resourceType: 'deposit',
      resourceId: depositId,
      detail: { depositTransactionId },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));
  }
}
