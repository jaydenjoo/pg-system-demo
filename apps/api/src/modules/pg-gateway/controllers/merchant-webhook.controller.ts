// ============================================================
// PG Gateway — 가맹점 포탈용 웹훅 관리 컨트롤러 (JWT 인증)
// WebhookController(PG Basic Auth)와 별도로, 가맹점 포탈에서
// JWT 인증으로 웹훅을 설정·조회·테스트·재발송하는 엔드포인트.
// ============================================================
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@pg-system/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../common/decorators/current-user.decorator';
import { OwnershipInterceptor } from '../../../common/interceptors/ownership.interceptor';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookService } from '../services/webhook.service';
import { UpdateWebhookConfigDto } from '../dto/webhook-config.dto';
import { WebhookEventsQueryDto } from '../dto/webhook-events-query.dto';
import { WebhookTestResponseDto } from '../dto/webhook-test.dto';

/**
 * 가맹점 포탈용 웹훅 관리 컨트롤러.
 * JWT 인증 + PG_WEBHOOK_MANAGE 권한 필요.
 * merchantId → apiKeyId 내부 변환 (가맹점은 apiKeyId를 알 필요 없음).
 */
@Controller('api/v1/webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(OwnershipInterceptor)
@ApiTags('Merchant-Webhook')
@ApiBearerAuth('JWT')
export class MerchantWebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly prisma: PrismaService,
  ) {}

  /** merchantId로 활성 API 키 ID 조회 (내부 헬퍼) */
  private async getApiKeyId(merchantId: string): Promise<string> {
    const apiKey = await this.prisma.pg_api_keys.findFirst({
      where: { merchant_id: merchantId, is_active: true },
      select: { id: true },
      orderBy: { created_at: 'desc' },
    });

    if (!apiKey) {
      throw new NotFoundException({
        errorCode: 'PG_API_KEY_NOT_FOUND',
        message: '활성 API 키가 없습니다. 먼저 API 키를 생성해주세요.',
      });
    }

    return apiKey.id;
  }

  /** PUT /api/v1/webhooks/config — 웹훅 URL/Secret 업데이트 */
  @Put('config')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PG_WEBHOOK_MANAGE)
  @ApiOperation({ summary: '웹훅 설정 업데이트 (가맹점 포탈)' })
  @ApiResponse({ status: HttpStatus.OK, description: '웹훅 설정 업데이트 성공' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async updateConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateWebhookConfigDto,
  ): Promise<{ data: { webhookUrl: string; message: string } }> {
    const apiKeyId = await this.getApiKeyId(user.merchantId!);

    const result = await this.webhookService.updateConfig(
      apiKeyId,
      dto.webhookUrl,
      dto.webhookSecret,
    );

    return {
      data: {
        webhookUrl: result.webhookUrl,
        message: '웹훅 설정이 업데이트되었습니다',
      },
    };
  }

  /** GET /api/v1/webhooks/config — 현재 웹훅 설정 조회 */
  @Get('config')
  @RequirePermissions(PERMISSIONS.PG_WEBHOOK_MANAGE)
  @ApiOperation({ summary: '현재 웹훅 설정 조회 (가맹점 포탈)' })
  @ApiResponse({ status: HttpStatus.OK, description: '웹훅 설정 조회 성공' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async getConfig(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: { webhookUrl: string | null; hasWebhookSecret: boolean } }> {
    const apiKeyId = await this.getApiKeyId(user.merchantId!);
    return { data: await this.webhookService.getConfig(apiKeyId) };
  }

  /** GET /api/v1/webhooks/events — 웹훅 이벤트 발송 내역 (최근 50건, 필터) */
  @Get('events')
  @RequirePermissions(PERMISSIONS.PG_WEBHOOK_MANAGE)
  @ApiOperation({ summary: '웹훅 이벤트 발송 내역 조회 (가맹점 포탈)' })
  @ApiResponse({ status: HttpStatus.OK, description: '웹훅 이벤트 조회 성공' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async listEvents(
    @CurrentUser() user: JwtPayload,
    @Query() query: WebhookEventsQueryDto,
  ): Promise<{
    data: {
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
    };
  }> {
    const limit = Math.min(
      Math.max(parseInt(query.limit ?? '20', 10) || 20, 1),
      50,
    );

    return {
      data: await this.webhookService.listEvents(user.merchantId!, limit, {
        status: query.status,
        startDate: query.startDate,
        endDate: query.endDate,
      }),
    };
  }

  /** POST /api/v1/webhooks/test — 테스트 웹훅 발송 */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PG_WEBHOOK_MANAGE)
  @ApiOperation({ summary: '웹훅 테스트 발송 (가맹점 포탈)' })
  @ApiResponse({ status: HttpStatus.OK, type: WebhookTestResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async testWebhook(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: WebhookTestResponseDto }> {
    const apiKeyId = await this.getApiKeyId(user.merchantId!);
    return { data: await this.webhookService.sendTest(apiKeyId) };
  }

  /** POST /api/v1/webhooks/events/:id/resend — FAILED 웹훅 수동 재발송 */
  @Post('events/:id/resend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PG_WEBHOOK_MANAGE)
  @ApiOperation({ summary: 'FAILED 웹훅 수동 재발송 (가맹점 포탈)' })
  @ApiResponse({ status: HttpStatus.OK, description: '재발송 결과' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async resendWebhook(
    @CurrentUser() user: JwtPayload,
    @Param('id') webhookId: string,
  ): Promise<{ data: { success: boolean; message: string } }> {
    return { data: await this.webhookService.resend(webhookId, user.merchantId!) };
  }
}
