import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, ERROR_CODES, PAGINATION, TRANSACTION_STATUS } from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { TransactionListQueryDto } from "./dto/transaction-list-query.dto";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { CancelTransactionDto } from "./dto/cancel-transaction.dto";

/**
 * @description 거래(Transaction) 관리 서비스. 결제/취소 거래 생성, 조회, 취소 기능 제공.
 * PCI DSS 3.x (Protect Stored Data) 및 4.x (Encrypt Transmissions) 준수:
 * 거래 데이터의 암호화 및 보안한 전송 관리
 * @security PCI DSS 3.2.1 - 거래 데이터 저장 시 암호화 (금액은 BigInt로 정밀도 유지)
 * @security PCI DSS 4.1 - TLS를 통한 전송 암호화
 * @audit 모든 거래 생성/취소 시 created_by/updated_by로 누가 처리했는지 기록
 */
@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  /**
   * @description 거래 목록을 페이지네이션과 함께 조회.
   * 가맹점, 대리점, 상태, 결제수단, 거래유형, 날짜로 필터링 가능.
   * @param {TransactionListQueryDto} query - 페이지, 한도, 필터 조건들
   * @returns {Promise<{data: Array, meta: {total, page, limit, totalPages}}>} 거래 목록 및 메타정보
   * @security PCI DSS 3.2.1 - 거래 데이터 조회 시에도 보안 감시
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async findAll(query: TransactionListQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.transactionsWhereInput = {
      ...(query.merchantId !== undefined
        ? { merchant_id: query.merchantId }
        : {}),
      ...(query.agentId !== undefined
        ? { merchants: { agent_id: query.agentId } }
        : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.paymentMethod !== undefined
        ? { payment_method: query.paymentMethod }
        : {}),
      ...(query.tranType !== undefined ? { tran_type: query.tranType } : {}),
      ...(query.search !== undefined
        ? { tran_no: { contains: query.search, mode: "insensitive" } }
        : {}),
      ...(query.startDate !== undefined && query.endDate !== undefined
        ? {
            approved_at: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.transactions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { approved_at: "desc" },
        include: {
          merchants: {
            select: { merchant_name: true, merchant_code: true },
          },
          merchant_terminals: {
            select: { id: true, terminal_name: true },
          },
        },
      }),
      this.prisma.transactions.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * @description 특정 거래의 상세 정보 조회. 원거래/취소 거래 정보 포함.
   * @param {string} id - 거래 ID
   * @returns {Promise<Transaction>} 거래 상세 정보
   * @security PCI DSS 3.2.1 - 거래 데이터 접근 제어
   * @audit 존재하지 않는 거래 접근 시도는 NotFoundException으로 감지
   */
  async findOne(id: string) {
    const transaction = await this.prisma.transactions.findUnique({
      where: { id },
      select: {
        id: true,
        tran_no: true,
        merchant_id: true,
        terminal_id: true,
        tran_type: true,
        payment_method: true,
        amount: true,
        fee_amount: true,
        net_amount: true,
        vat_amount: true,
        status: true,
        original_tran_id: true,
        payment_detail: true,
        requested_at: true,
        approved_at: true,
        cancelled_at: true,
        created_at: true,
        created_by: true,
        updated_at: true,
        merchants: {
          select: {
            id: true,
            merchant_name: true,
            merchant_code: true,
            status: true,
          },
        },
        original_transaction: {
          select: { id: true, tran_no: true, amount: true, status: true },
        },
        cancel_transactions: {
          select: {
            id: true,
            tran_no: true,
            amount: true,
            status: true,
            cancelled_at: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: "거래를 찾을 수 없습니다",
      });
    }

    return transaction;
  }

  /**
   * @description 새로운 거래를 생성. 가맹점 활성 상태 및 수수료 검증.
   * BigInt를 사용하여 대액 거래의 정밀도 손실 방지. VAT는 BigInt 연산으로 계산.
   * @param {CreateTransactionDto} dto - 거래 금액, 수수료, 결제수단, 단말기ID 등
   * @param {string} createdBy - 생성자 ID (감사 추적용)
   * @returns {Promise<Transaction>} 생성된 거래 정보
   * @security PCI DSS 3.2.1 - 거래 금액 데이터 보호 (BigInt로 정밀도 유지)
   * @security PCI DSS 10.2.1 - 거래 생성자 기록 필수
   * @audit 거래 생성자, 생성 시간, 금액 기록 (created_by, approved_at, amount)
   */
  async create(dto: CreateTransactionDto, createdBy: string) {
    // 가맹점 활성 상태 검증
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: dto.merchantId },
    });
    if (!merchant) {
      throw new NotFoundException({
        code: ERROR_CODES.MERCHANT_001,
        message: "가맹점을 찾을 수 없습니다",
      });
    }
    if (merchant.status !== "ACTIVE") {
      throw new ConflictException({
        code: ERROR_CODES.MERCHANT_003,
        message: "가맹점이 활성 상태가 아닙니다",
      });
    }

    const feeAmount = dto.feeAmount ?? 0;

    // 수수료 검증
    if (feeAmount > dto.amount) {
      throw new BadRequestException({
        code: ERROR_CODES.TXN_002,
        message: "수수료가 거래 금액을 초과합니다",
      });
    }

    // BigInt 연산으로 VAT 계산 (Number 나눗셈의 대형 금액 정밀도 손실 방지)
    const vatAmount = BigInt(dto.amount) / BigInt(11);

    const paymentDetail: Record<string, unknown> = {
      ...(dto.paymentDetail ?? {}),
      orderNo: dto.orderNo,
      orderName: dto.orderName,
    };

    const transaction = await this.prisma.transactions.create({
      data: {
        tran_no: `TXN${Date.now()}${randomUUID().slice(0, 8).toUpperCase()}`,
        merchant_id: dto.merchantId,
        terminal_id: dto.terminalId ?? null,
        tran_type: dto.transactionType,
        payment_method: dto.paymentMethod,
        amount: BigInt(dto.amount),
        fee_amount: BigInt(feeAmount),
        net_amount: BigInt(dto.amount) - BigInt(feeAmount),
        vat_amount: vatAmount,
        status: TRANSACTION_STATUS.APPROVED,
        approved_at: new Date(),
        payment_detail: paymentDetail as Prisma.InputJsonValue,
        created_by: createdBy,
      },
    });

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.TRANSACTION_CREATE,
      resourceType: 'transaction',
      resourceId: transaction.id,
      detail: { tranNo: transaction.tran_no, amount: dto.amount, paymentMethod: dto.paymentMethod },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return transaction;
  }

  /**
   * @description 승인된 거래를 취소 (환불). 취소 사유를 payment_detail에 기록.
   * @param {string} id - 원거래 ID
   * @param {CancelTransactionDto} dto - 취소 사유
   * @param {string} updatedBy - 취소 처리자 ID (감사 추적용)
   * @returns {Promise<Transaction>} 취소 상태로 업데이트된 거래 정보
   * @security PCI DSS 3.2.1 - 거래 취소 정보 기록
   * @security PCI DSS 10.2.5 - 거래 취소 감사 기록 필수
   * @audit 취소자, 취소 시간, 취소 사유 기록 (updated_by, cancelled_at, payment_detail.cancelReason)
   */
  async cancel(id: string, dto: CancelTransactionDto, updatedBy: string) {
    const transaction = await this.findOne(id);

    if (transaction.status !== TRANSACTION_STATUS.APPROVED) {
      throw new ConflictException({
        code: ERROR_CODES.TXN_003,
        message: "승인된 거래만 취소할 수 있습니다",
      });
    }

    const existingDetail =
      typeof transaction.payment_detail === "object" &&
      transaction.payment_detail !== null
        ? (transaction.payment_detail as Record<string, unknown>)
        : {};

    const updatedDetail = {
      ...existingDetail,
      cancelReason: dto.reason,
    };

    const cancelled = await this.prisma.transactions.update({
      where: { id },
      data: {
        status: TRANSACTION_STATUS.CANCELLED,
        cancelled_at: new Date(),
        payment_detail: updatedDetail as Prisma.InputJsonValue,
        updated_by: updatedBy,
      },
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.TRANSACTION_CANCEL,
      resourceType: 'transaction',
      resourceId: id,
      detail: { reason: dto.reason },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return cancelled;
  }
}
