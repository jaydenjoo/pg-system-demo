// ============================================================
// PG Gateway — IP 화이트리스트 가드 (PCI DSS 1.3.2)
// PgBasicAuthGuard 이후에 실행 — req.pgApiKeyId 필요
// ============================================================
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { ERROR_CODES, AUDIT_ACTIONS } from '@pg-system/shared';

/**
 * PCI DSS 1.3.2 — API 키별 IP 화이트리스트 검증.
 *
 * 규칙:
 * - pgApiKeyId 미존재(deposit-callback 등 퍼블릭 엔드포인트) → 통과
 * - allowed_ips 가 빈 배열 → 모든 IP 허용 (제한 없음)
 * - allowed_ips 에 클라이언트 IP 포함 → 허용
 * - allowed_ips 에 클라이언트 IP 미포함 → 403 ForbiddenException
 */
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IpWhitelistGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { pgApiKeyId?: string }>();

    // 인증이 필요 없는 퍼블릭 엔드포인트(deposit-callback 등)는 pgApiKeyId가 없음 → 통과
    if (!req.pgApiKeyId) {
      return true;
    }

    const apiKey = await this.prisma.pg_api_keys.findUnique({
      where: { id: req.pgApiKeyId },
      select: { allowed_ips: true },
    });

    // 키 메타데이터를 찾지 못한 경우 → 제한 없음으로 처리
    // (인증은 이미 PgBasicAuthGuard에서 완료됨)
    if (!apiKey) {
      return true;
    }

    // allowed_ips가 비어 있으면 모든 IP 허용
    if (apiKey.allowed_ips.length === 0) {
      return true;
    }

    const clientIp = this.extractClientIp(req);

    if (!apiKey.allowed_ips.includes(clientIp)) {
      this.logger.warn(
        `IP 접근 차단: apiKeyId=${req.pgApiKeyId}, clientIp=${clientIp}`,
      );
      // PCI DSS 10.2.1 — IP 차단 이벤트 감사 로그 기록 (fire-and-forget)
      void this.security
        .writeAuditLog({
          action: AUDIT_ACTIONS.IP_WHITELIST_BLOCKED,
          resourceType: 'pg_api_keys',
          resourceId: req.pgApiKeyId,
          detail: {
            blockedIp: clientIp,
            allowedIps: apiKey.allowed_ips,
          },
          ipAddress: clientIp,
        })
        .catch((err: unknown) =>
          this.logger.error('IP 차단 감사 로그 기록 실패', err),
        );
      throw new ForbiddenException({
        code: ERROR_CODES.PGW_IP_BLOCKED,
        message: '허용되지 않은 IP 주소입니다',
      });
    }

    return true;
  }

  /**
   * Express trust proxy 설정에 의해 검증된 req.ip를 사용.
   * X-Forwarded-For 직접 파싱은 IP 스푸핑 위험 (OWASP A05) → req.ip 우선.
   */
  private extractClientIp(req: Request): string {
    // req.ip는 trust proxy 설정에 따라 안전하게 클라이언트 IP를 반환
    return req.ip ?? req.socket.remoteAddress ?? '';
  }
}
