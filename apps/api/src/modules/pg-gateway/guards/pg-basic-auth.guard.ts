// ============================================================
// PG Gateway — Basic Auth 가드
// Toss Payments 방식: Authorization: Basic base64(secretKey:)
// ============================================================
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES } from '@pg-system/shared';
import { ApiKeyService } from '../services/api-key.service';

/** request 객체에 PG 인증 정보를 붙이는 확장 인터페이스 */
export interface PgAuthenticatedRequest extends Request {
  pgMerchantId: string;
  pgApiKeyId: string;
  pgClientKey: string;
  /** AuditInterceptor 연동 — 감사 로그에 merchantId 기록 */
  user?: { sub: string; loginId: string; userType: string };
}

@Injectable()
export class PgBasicAuthGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PgAuthenticatedRequest>();

    const authHeader = request.headers['authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException({
        code: ERROR_CODES.PGW_001,
        message: '유효하지 않은 API 키',
      });
    }

    // base64(secretKey:) 디코딩 — 콜론 뒤는 비어있음 (Toss Payments 스타일)
    const base64Payload = authHeader.slice(6).trim();
    let decoded: string;
    try {
      decoded = Buffer.from(base64Payload, 'base64').toString('utf-8');
    } catch {
      throw new UnauthorizedException({
        code: ERROR_CODES.PGW_001,
        message: '유효하지 않은 API 키',
      });
    }

    // "secretKey:" 또는 "secretKey" 형태 모두 지원
    const secretKey = decoded.endsWith(':')
      ? decoded.slice(0, -1)
      : decoded.split(':')[0];

    if (!secretKey) {
      throw new UnauthorizedException({
        code: ERROR_CODES.PGW_001,
        message: '유효하지 않은 API 키',
      });
    }

    const validated = await this.apiKeyService.validateSecretKey(secretKey);
    if (!validated) {
      throw new UnauthorizedException({
        code: ERROR_CODES.PGW_001,
        message: '유효하지 않은 API 키',
      });
    }

    // 이후 컨트롤러에서 사용할 수 있도록 request에 주입
    request.pgMerchantId = validated.merchantId;
    request.pgApiKeyId = validated.id;
    request.pgClientKey = validated.clientKey;

    // AuditInterceptor 연동 — 감사 로그에 merchantId 기록
    request.user = {
      sub: validated.merchantId,
      loginId: validated.id,
      userType: 'MERCHANT',
    };

    return true;
  }
}
