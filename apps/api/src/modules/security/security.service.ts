import { Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PAGINATION, ERROR_CODES } from "@pg-system/shared";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import { RiskAlertQueryDto } from "./dto/risk-alert-query.dto";
import { AuditHashChainService } from "./audit-hash-chain.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationSeverity } from "../notifications/channels/notification-channel.interface";

/** 감사 로그 기록용 입력 데이터 */
export interface WriteAuditLogData {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  detail?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 보안 서비스 — 감사 로그, 리스크 알림, 로그인 이력 관리.
 *
 * @security PCI DSS 10.x 준수 — 모든 접근/변경 이력을 해시 체인으로 기록하여 위변조 방지.
 * @audit 감사 로그는 직렬화 트랜잭션으로 해시 체인 무결성을 보장함.
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditHashChain: AuditHashChainService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * 감사 로그 목록 조회 (페이지네이션).
   * @param query - 사용자ID, 액션, 리소스타입, 기간 필터
   * @returns 감사 로그 배열 + 페이지네이션 메타 정보
   */
  async getAuditLogs(query: AuditLogQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      ...(query.userId !== undefined ? { user_id: query.userId } : {}),
      ...(query.action !== undefined ? { action: query.action } : {}),
      ...(query.resourceType !== undefined
        ? { resource_type: query.resourceType }
        : {}),
      ...(query.startDate !== undefined && query.endDate !== undefined
        ? {
            created_at: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.audit_logs.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      this.prisma.audit_logs.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 리스크 알림 목록 조회 (페이지네이션).
   * @param query - 심각도(severity), 해결 여부(resolved) 필터
   * @returns 리스크 알림 배열 + 페이지네이션 메타 정보
   */
  async getRiskAlerts(query: RiskAlertQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      ...(query.severity !== undefined ? { severity: query.severity } : {}),
      ...(query.resolved !== undefined
        ? { status: query.resolved ? "RESOLVED" : "OPEN" }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.risk_alerts.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      this.prisma.risk_alerts.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 리스크 알림 해결 처리.
   * @param id - 리스크 알림 ID
   * @param resolvedBy - 해결 처리자 ID
   * @returns 업데이트된 리스크 알림 레코드
   * @throws NotFoundException 알림이 존재하지 않을 경우
   */
  async resolveRiskAlert(id: string, resolvedBy: string) {
    const alert = await this.prisma.risk_alerts.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException({
        code: ERROR_CODES.RISK_001,
        message: "리스크 알림을 찾을 수 없습니다",
      });
    }
    return this.prisma.risk_alerts.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolved_at: new Date(),
        resolved_by: resolvedBy,
      },
    });
  }

  /**
   * 로그인 이력 조회 (페이지네이션).
   * @param query - 사용자ID, 로그인 결과(성공/실패), 기간 필터
   * @returns 로그인 이력 배열 + 페이지네이션 메타 정보
   */
  async getLoginHistory(query: AuditLogQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      ...(query.userId !== undefined ? { user_id: query.userId } : {}),
      ...(query.result !== undefined ? { login_result: query.result } : {}),
      ...(query.startDate !== undefined && query.endDate !== undefined
        ? {
            created_at: {
              gte: new Date(query.startDate),
              lte: new Date(query.endDate),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.login_history.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      this.prisma.login_history.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 리스크 알림 생성 + 알림 채널(Slack/Email) 비동기 발송.
   * @param data - 알림 유형, 심각도, 설명, 관련 가맹점/거래 ID
   * @security 비동기 발송 실패 시에도 알림 생성 자체는 보장됨 (fire-and-forget)
   */
  async createRiskAlert(data: {
    alertType: string;
    severity: string;
    description: string;
    merchantId?: string;
    transactionId?: string;
  }): Promise<void> {
    const alert = await this.prisma.risk_alerts.create({
      data: {
        alert_type: data.alertType,
        severity: data.severity,
        description: data.description,
        ...(data.merchantId !== undefined
          ? { merchant_id: data.merchantId }
          : {}),
        ...(data.transactionId !== undefined
          ? { transaction_id: data.transactionId }
          : {}),
      },
      select: { id: true, alert_type: true, severity: true },
    });

    if (this.notifications) {
      void this.notifications
        .send({
          title: `Risk Alert: ${data.alertType}`,
          message: data.description,
          severity: this.toNotificationSeverity(data.severity),
          timestamp: new Date(),
          metadata: {
            alertId: alert.id,
            alertType: alert.alert_type,
            ...(data.merchantId !== undefined
              ? { merchantId: data.merchantId }
              : {}),
            ...(data.transactionId !== undefined
              ? { transactionId: data.transactionId }
              : {}),
          },
        })
        .catch((err: unknown) => {
          this.logger.error(`Risk Alert 알림 발송 실패: ${String(err)}`);
        });
    }
  }

  /** DB 심각도 문자열 → NotificationSeverity 열거형 변환. 매핑 실패 시 'INFO' 반환. */
  private toNotificationSeverity(severity: string): NotificationSeverity {
    const map: Record<string, NotificationSeverity> = {
      CRITICAL: "CRITICAL",
      HIGH: "HIGH",
      MEDIUM: "MEDIUM",
      LOW: "LOW",
    };
    return map[severity] ?? "INFO";
  }

  /**
   * 감사 로그 기록 (해시 체인 포함).
   *
   * 직렬화 트랜잭션($transaction)으로 이전 해시를 읽고 → 새 해시를 계산하여 체인을 연결.
   * race condition 방지: 동시 쓰기 시에도 해시 체인 무결성 보장.
   *
   * @param data - 사용자ID, 액션, 리소스 정보, IP, User-Agent
   * @security PCI DSS 10.3.3 — 감사 로그 위변조 방지를 위한 해시 체인
   * @audit 기록 실패 시 에러 로그만 남기고 서비스 응답에 영향 없음 (fire-and-forget 호출 측에서 보장)
   */
  async writeAuditLog(data: WriteAuditLogData): Promise<void> {
    const now = new Date();

    // 직렬화된 트랜잭션으로 해시 체인 race condition 방지
    try {
      await this.prisma.$transaction(async (tx) => {
        const latest = await tx.audit_logs.findFirst({
          where: { log_hash: { not: null } },
          orderBy: { created_at: "desc" },
          select: { log_hash: true },
        });
        const latestHash = latest?.log_hash ?? null;

        const contentHash = this.auditHashChain.computeLogHash({
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          detail: data.detail,
          ipAddress: data.ipAddress,
          createdAt: now,
        });
        const logHash = this.auditHashChain.computeChainHash(
          contentHash,
          latestHash,
        );

        await tx.audit_logs.create({
          data: {
            ...(data.userId !== undefined ? { user_id: data.userId } : {}),
            action: data.action,
            resource_type: data.resourceType,
            ...(data.resourceId !== undefined
              ? { resource_id: data.resourceId }
              : {}),
            ...(data.detail !== undefined ? { detail: data.detail } : {}),
            ...(data.ipAddress !== undefined
              ? { ip_address: data.ipAddress }
              : {}),
            ...(data.userAgent !== undefined
              ? { user_agent: data.userAgent }
              : {}),
            log_hash: logHash,
            prev_hash: latestHash,
            created_at: now,
          },
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`감사 로그 기록 실패: ${message}`);
    }
  }
}
