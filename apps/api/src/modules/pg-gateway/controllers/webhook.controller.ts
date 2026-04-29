// ============================================================
// PG Gateway — 웹훅 설정/조회 컨트롤러 (가맹점 Basic Auth)
// H-4: 비즈니스 로직을 WebhookService로 분리
// ============================================================
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { PgBasicAuthGuard } from '../guards/pg-basic-auth.guard';
import type { PgAuthenticatedRequest } from '../guards/pg-basic-auth.guard';
import { IpWhitelistGuard } from '../guards/ip-whitelist.guard';
import { WebhookService } from '../services/webhook.service';
import { UpdateWebhookConfigDto } from '../dto/webhook-config.dto';
import { WebhookEventsQueryDto } from '../dto/webhook-events-query.dto';
import { WebhookTestResponseDto } from '../dto/webhook-test.dto';

/**
 * @description PG 게이트웨이 웹훅 설정 컨트롤러 (가맹점용). 웹훅 URL/Secret 설정·조회·이벤트 이력 엔드포인트 제공.
 * Basic Auth(API Key + Secret Key) + IP 화이트리스트 이중 인증 적용.
 * 웹훅 Secret으로 HMAC-SHA256 서명 검증 지원, 이벤트 발송 최대 50건 이력 조회.
 * @security PCI DSS 6.5.10 - 웹훅 콜백 URL 검증 및 서명 기반 무결성 보장
 */
@ApiTags('PG-Webhook')
@ApiBasicAuth('PG-Basic')
@Controller('pg/v1/webhooks')
@UseGuards(PgBasicAuthGuard, IpWhitelistGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /** PUT /pg/v1/webhooks/config — 웹훅 URL/Secret 업데이트 */
  @Put('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '웹훅 설정 업데이트' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '웹훅 설정 업데이트 성공',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '유효하지 않은 요청 (URL 형식 불일치 등)',
    type: ErrorResponseDto,
  })
  async updateConfig(
    @Req() req: PgAuthenticatedRequest,
    @Body() dto: UpdateWebhookConfigDto,
  ): Promise<{ webhookUrl: string; message: string }> {
    const result = await this.webhookService.updateConfig(
      req.pgApiKeyId,
      dto.webhookUrl,
      dto.webhookSecret,
    );

    return {
      webhookUrl: result.webhookUrl,
      message: '웹훅 설정이 업데이트되었습니다',
    };
  }

  /** GET /pg/v1/webhooks/config — 현재 웹훅 설정 조회 */
  @Get('config')
  @ApiOperation({ summary: '현재 웹훅 설정 조회' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '웹훅 설정 조회 성공',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  async getConfig(
    @Req() req: PgAuthenticatedRequest,
  ): Promise<{ webhookUrl: string | null; hasWebhookSecret: boolean }> {
    return this.webhookService.getConfig(req.pgApiKeyId);
  }

  /** GET /pg/v1/webhooks/events — 웹훅 이벤트 발송 내역 (최근 50건, 필터 지원) */
  @Get('events')
  @ApiOperation({ summary: '웹훅 이벤트 발송 내역 조회 (상태/날짜 필터)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '웹훅 이벤트 조회 성공 (최대 50건)',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  async listEvents(
    @Req() req: PgAuthenticatedRequest,
    @Query() query: WebhookEventsQueryDto,
  ): Promise<{
    events: Array<{
      id: string;
      event_type: string;
      status: string;
      retry_count: number;
      sent_at: Date | null;
      response_status: number | null;
      created_at: Date;
    }>;
    count: number;
  }> {
    const limit = Math.min(
      Math.max(parseInt(query.limit ?? '20', 10) || 20, 1),
      50,
    );

    return this.webhookService.listEvents(req.pgMerchantId, limit, {
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  /** POST /pg/v1/webhooks/test — 테스트 웹훅 발송 (DB 저장 안 함) */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '웹훅 테스트 발송' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '테스트 발송 결과',
    type: WebhookTestResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  async testWebhook(
    @Req() req: PgAuthenticatedRequest,
  ): Promise<WebhookTestResponseDto> {
    return this.webhookService.sendTest(req.pgApiKeyId);
  }

  /** POST /pg/v1/webhooks/events/:id/resend — FAILED 웹훅 수동 재발송 */
  @Post('events/:id/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'FAILED 웹훅 수동 재발송' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '재발송 결과',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  async resendWebhook(
    @Req() req: PgAuthenticatedRequest,
    @Param('id') webhookId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.webhookService.resend(webhookId, req.pgMerchantId);
  }
}
