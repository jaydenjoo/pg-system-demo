import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

const GENESIS_MARKER = "GENESIS";

export interface AuditLogInput {
  action: string;
  resourceType: string;
  resourceId?: string | null | undefined;
  detail?: unknown;
  ipAddress?: string | null | undefined;
  createdAt: Date;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalLogs: number;
  brokenAt?: string;
}

/**
 * @description 감사 로그 해시 체인 서비스.
 * 블록체인 원리를 차용하여 감사 로그의 위변조를 탐지.
 * 각 로그에 SHA-256 해시를 생성하고 이전 로그 해시와 연결(체인)하여
 * 중간 로그가 변조되면 이후 체인이 모두 깨지는 구조.
 * @security PCI DSS 10.5.5 — 로그 무결성 모니터링 (해시 체인으로 변조 탐지)
 * @security PCI DSS 10.3 — 감사 추적 기록의 보호
 * @audit 체인 검증 실패 시 brokenAt 로그 ID를 반환하여 변조 지점 특정 가능
 */
@Injectable()
export class AuditHashChainService {
  private readonly logger = new Logger(AuditHashChainService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * @description 로그 엔트리의 내용 해시(SHA-256) 계산.
   * 로그의 주요 필드를 length-prefix 방식으로 직렬화하여 구분자 충돌을 방지.
   * @param {AuditLogInput} logEntry - 해시 대상 로그 데이터 (action, resourceType 등)
   * @returns {string} 64자 hex SHA-256 해시
   * @security PCI DSS 10.5.5 — 로그 내용 무결성 보장용 해시
   */
  computeLogHash(logEntry: AuditLogInput): string {
    const parts = [
      logEntry.action,
      logEntry.resourceType,
      logEntry.resourceId ?? "",
      logEntry.detail !== undefined && logEntry.detail !== null
        ? JSON.stringify(logEntry.detail)
        : "",
      logEntry.ipAddress ?? "",
      logEntry.createdAt.toISOString(),
    ];
    // length-prefix 방식으로 구분자 충돌 방지
    const encoded = parts.map((p) => `${p.length}:${p}`).join("");
    return crypto.createHash("sha256").update(encoded).digest("hex");
  }

  /**
   * @description 체인 해시 계산. 현재 로그 해시 + 이전 체인 해시를 결합하여 SHA-256 생성.
   * 첫 번째 로그는 prevHash 대신 "GENESIS" 마커를 사용.
   * @param {string} currentLogHash - computeLogHash()로 생성된 현재 로그 해시
   * @param {string | null} prevHash - 직전 로그의 체인 해시 (첫 로그면 null)
   * @returns {string} 64자 hex SHA-256 체인 해시
   * @security PCI DSS 10.5.5 — 로그 순서 무결성 보장 (체인 연결)
   */
  computeChainHash(currentLogHash: string, prevHash: string | null): string {
    const input = currentLogHash + (prevHash ?? GENESIS_MARKER);
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /**
   * @description 가장 최근 감사 로그의 체인 해시 조회.
   * 새 로그 추가 시 이전 해시(prevHash)로 사용.
   * @returns {Promise<string | null>} 최신 로그의 log_hash, 로그가 없으면 null
   */
  async getLatestHash(): Promise<string | null> {
    const latest = await this.prisma.audit_logs.findFirst({
      where: { log_hash: { not: null } },
      orderBy: { created_at: "desc" },
      select: { log_hash: true },
    });
    return latest?.log_hash ?? null;
  }

  /**
   * @description 지정 기간 내 감사 로그 해시 체인의 무결성을 검증.
   * 시간순으로 로그를 순회하며 prevHash 연결과 logHash 재계산을 검증.
   * @param {Date} startDate - 검증 시작 일시
   * @param {Date} endDate - 검증 종료 일시
   * @returns {Promise<ChainVerificationResult>} 검증 결과 (valid, totalLogs, brokenAt)
   * @security PCI DSS 10.5.5 — 감사 로그 위변조 탐지
   * @security PCI DSS 11.5 — 파일 무결성 모니터링과 연계
   * @audit 체인 끊김 시 brokenAt에 변조 의심 로그 ID 기록
   */
  async verifyChain(
    startDate: Date,
    endDate: Date,
  ): Promise<ChainVerificationResult> {
    const logs = await this.prisma.audit_logs.findMany({
      where: {
        created_at: { gte: startDate, lte: endDate },
        log_hash: { not: null },
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        action: true,
        resource_type: true,
        resource_id: true,
        detail: true,
        ip_address: true,
        created_at: true,
        log_hash: true,
        prev_hash: true,
      },
    });

    if (logs.length === 0) {
      return { valid: true, totalLogs: 0 };
    }

    // 체인 시작 전 로그의 해시 (prev_hash 검증용)
    const firstLog = logs[0];
    if (!firstLog) {
      return { valid: true, totalLogs: 0 };
    }

    // 시작 이전의 마지막 로그 해시 조회
    const prevLog = await this.prisma.audit_logs.findFirst({
      where: {
        created_at: { lt: startDate },
        log_hash: { not: null },
      },
      orderBy: { created_at: "desc" },
      select: { log_hash: true },
    });
    let expectedPrevHash: string | null = prevLog?.log_hash ?? null;

    for (const log of logs) {
      // 1) prev_hash 검증
      const actualPrevHash = log.prev_hash ?? null;
      if (actualPrevHash !== expectedPrevHash) {
        this.logger.warn(
          `해시 체인 끊김 감지: logId=${log.id}, expected prev=${expectedPrevHash}, actual prev=${actualPrevHash}`,
        );
        return {
          valid: false,
          totalLogs: logs.length,
          brokenAt: log.id,
        };
      }

      // 2) log_hash 재계산 검증
      const recomputedLogHash = this.computeLogHash({
        action: log.action,
        resourceType: log.resource_type,
        resourceId: log.resource_id,
        detail: log.detail,
        ipAddress: log.ip_address,
        createdAt: log.created_at,
      });

      const recomputedChainHash = this.computeChainHash(
        recomputedLogHash,
        expectedPrevHash,
      );

      if (recomputedChainHash !== log.log_hash) {
        this.logger.warn(
          `로그 내용 변조 감지: logId=${log.id}, stored=${log.log_hash}, recomputed=${recomputedChainHash}`,
        );
        return {
          valid: false,
          totalLogs: logs.length,
          brokenAt: log.id,
        };
      }

      expectedPrevHash = log.log_hash;
    }

    return { valid: true, totalLogs: logs.length };
  }
}
