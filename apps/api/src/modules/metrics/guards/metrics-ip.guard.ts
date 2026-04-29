import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const LOCALHOST_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/**
 * Metrics 엔드포인트 IP 화이트리스트 가드.
 *
 * 환경변수 METRICS_ALLOWED_IPS (쉼표 구분)로 허용 IP 설정.
 * 미설정 시 로컬호스트(127.0.0.1, ::1)만 허용.
 *
 * @security PCI DSS 7.1 — 내부 운영 데이터 접근 제한
 */
@Injectable()
export class MetricsIpGuard implements CanActivate {
  private readonly logger = new Logger(MetricsIpGuard.name);
  private readonly allowedIps: string[];

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('METRICS_ALLOWED_IPS');
    this.allowedIps = raw
      ? raw.split(',').map((ip) => ip.trim()).filter(Boolean)
      : LOCALHOST_IPS;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const clientIp = this.extractClientIp(req);

    if (!this.allowedIps.includes(clientIp)) {
      this.logger.warn(`Metrics 접근 차단: clientIp=${clientIp}`);
      throw new ForbiddenException('허용되지 않은 IP 주소입니다');
    }

    return true;
  }

  private extractClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return forwardedStr.split(',')[0].trim();
    }
    return req.ip ?? req.socket.remoteAddress ?? '';
  }
}
