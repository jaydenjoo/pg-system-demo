// ============================================================
// PG Gateway — 웹훅 발송 서비스
// HMAC-SHA256 서명 + 지수 백오프 재시도
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';
import {
  WEBHOOK_STATUS,
} from '@pg-system/shared';
import type {
  WebhookEventType,
  WebhookPayload,
  PgPaymentStatusCode,
} from '@pg-system/shared';

/** Prisma Json 필드 → WebhookPayload 타입 가드 */
function isWebhookPayload(value: JsonValue): value is JsonValue & WebhookPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['eventType'] === 'string' &&
    typeof obj['createdAt'] === 'string' &&
    typeof obj['data'] === 'object' &&
    obj['data'] !== null
  );
}

import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookCryptoService } from './webhook-crypto.service';
import { WebhookHttpService } from './webhook-http.service';

/** 최대 재시도 횟수 */
const MAX_RETRIES = 7;

/** 기본 대기 시간 (밀리초) — 1분 */
const BASE_DELAY_MS = 60_000;

/** 한 번에 처리할 최대 PENDING 웹훅 수 */
const RETRY_BATCH_SIZE = 50;

/** response_body 최대 저장 길이 */
const MAX_RESPONSE_BODY_LENGTH = 1_000;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookCrypto: WebhookCryptoService,
    private readonly webhookHttp: WebhookHttpService,
  ) {}

  // ---- Config 메서드 ----

  /** 웹훅 URL/Secret 업데이트 (C-1: secret은 AES-256-GCM 암호화 저장) */
  async updateConfig(
    apiKeyId: string,
    webhookUrl: string,
    webhookSecret: string,
  ): Promise<{ webhookUrl: string }> {
    const encryptedHex = await this.webhookCrypto.encryptSecret(webhookSecret);

    await this.prisma.pg_api_keys.update({
      where: { id: apiKeyId },
      data: {
        webhook_url: webhookUrl,
        webhook_secret: encryptedHex,
      },
    });

    return { webhookUrl };
  }

  /** 웹훅 설정 조회 (secret 자체는 노출하지 않음) */
  async getConfig(
    apiKeyId: string,
  ): Promise<{ webhookUrl: string | null; hasWebhookSecret: boolean }> {
    const apiKey = await this.prisma.pg_api_keys.findFirst({
      where: { id: apiKeyId },
    });

    return {
      webhookUrl: apiKey?.webhook_url ?? null,
      hasWebhookSecret: !!apiKey?.webhook_secret,
    };
  }

  /** 웹훅 이벤트 발송 내역 조회 (merchantId 격리, 상태/날짜 필터) */
  async listEvents(
    merchantId: string,
    limit: number,
    filters?: {
      status?: string | undefined;
      startDate?: string | undefined;
      endDate?: string | undefined;
    },
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
    const where: Record<string, unknown> = {
      pg_payment_orders: {
        merchant_id: merchantId,
      },
    };

    if (filters?.status) {
      where['status'] = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (filters.startDate) createdAt['gte'] = new Date(filters.startDate);
      if (filters?.endDate) createdAt['lte'] = new Date(filters.endDate);
      where['created_at'] = createdAt;
    }

    const events = await this.prisma.pg_webhooks.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        event_type: true,
        status: true,
        retry_count: true,
        sent_at: true,
        response_status: true,
        created_at: true,
      },
    });

    return { events, count: events.length };
  }

  /** 테스트 웹훅 발송 — 샘플 페이로드로 실 URL에 POST, DB 저장 안 함 */
  async sendTest(
    apiKeyId: string,
  ): Promise<{
    success: boolean;
    statusCode: number | null;
    responseTimeMs: number;
    message: string | null;
  }> {
    const apiKey = await this.prisma.pg_api_keys.findFirst({
      where: { id: apiKeyId },
    });

    if (!apiKey?.webhook_url) {
      return {
        success: false,
        statusCode: null,
        responseTimeMs: 0,
        message: '웹훅 URL이 설정되지 않았습니다',
      };
    }

    if (!apiKey.webhook_secret) {
      return {
        success: false,
        statusCode: null,
        responseTimeMs: 0,
        message: '웹훅 Secret이 설정되지 않았습니다',
      };
    }

    const webhookSecret = await this.webhookCrypto.decryptSecret(apiKey.webhook_secret);

    const samplePayload: WebhookPayload = {
      eventType: 'PAYMENT_STATUS_CHANGED' as WebhookEventType,
      createdAt: new Date().toISOString(),
      data: {
        paymentKey: 'test_' + Date.now(),
        orderId: 'test_order_' + Date.now(),
        status: 'DONE' as PgPaymentStatusCode,
        amount: 10000,
      },
    };

    const body = JSON.stringify(samplePayload);
    const signature = this.webhookCrypto.generateSignature(body, webhookSecret);

    const startMs = Date.now();
    const result = await this.webhookHttp.post(
      apiKey.webhook_url,
      body,
      signature,
      'test_' + Date.now(),
    );
    const responseTimeMs = Date.now() - startMs;

    if (result.ok) {
      return {
        success: true,
        statusCode: result.status,
        responseTimeMs,
        message: null,
      };
    }

    return {
      success: false,
      statusCode: result.error ? null : result.status,
      responseTimeMs,
      message: result.error ?? `HTTP ${result.status}`,
    };
  }

  /** FAILED 웹훅 수동 재발송 — 기존 페이로드로 즉시 1회 재시도 */
  async resend(
    webhookId: string,
    merchantId: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const webhook = await this.prisma.pg_webhooks.findFirst({
      where: { id: webhookId },
      include: {
        pg_payment_orders: {
          select: { id: true, merchant_id: true, api_key_id: true },
        },
      },
    });

    if (!webhook || webhook.pg_payment_orders?.merchant_id !== merchantId) {
      return { success: false, message: '웹훅을 찾을 수 없습니다' };
    }

    if (webhook.status !== WEBHOOK_STATUS.FAILED) {
      return {
        success: false,
        message: `FAILED 상태만 재발송 가능합니다 (현재: ${webhook.status})`,
      };
    }

    const order = webhook.pg_payment_orders;
    if (!order) {
      return { success: false, message: '연결된 주문을 찾을 수 없습니다' };
    }

    const apiKey = await this.prisma.pg_api_keys.findFirst({
      where: { id: order.api_key_id },
    });

    if (!apiKey?.webhook_url || !apiKey?.webhook_secret) {
      return { success: false, message: '웹훅 URL/Secret이 설정되지 않았습니다' };
    }

    if (!isWebhookPayload(webhook.payload)) {
      return { success: false, message: '웹훅 페이로드가 올바르지 않습니다' };
    }

    const webhookSecret = await this.webhookCrypto.decryptSecret(apiKey.webhook_secret);
    const payload: WebhookPayload = webhook.payload;
    const body = JSON.stringify(payload);
    const signature = this.webhookCrypto.generateSignature(body, webhookSecret);

    const result = await this.webhookHttp.post(
      apiKey.webhook_url,
      body,
      signature,
      webhook.id,
    );

    if (result.ok) {
      await this.prisma.pg_webhooks.update({
        where: { id: webhook.id },
        data: {
          status: WEBHOOK_STATUS.SENT,
          sent_at: new Date(),
          response_status: result.status,
          response_body: result.body.substring(0, MAX_RESPONSE_BODY_LENGTH),
        },
      });
      return { success: true, message: '재발송 성공' };
    }

    // 실패 시 retry_count 유지, 상태 FAILED 유지
    await this.prisma.pg_webhooks.update({
      where: { id: webhook.id },
      data: {
        response_status: result.error ? null : result.status,
        response_body: (result.error ?? result.body)?.substring(
          0,
          MAX_RESPONSE_BODY_LENGTH,
        ) ?? null,
      },
    });

    return {
      success: false,
      message: result.error ?? `HTTP ${result.status} 응답`,
    };
  }

  // ---- 발송 메서드 ----

  /**
   * 웹훅 발송 진입점.
   * 결제 상태 변경 후 호출. webhook_url 미설정 시 skip.
   */
  async dispatch(
    paymentOrderId: string,
    merchantId: string,
    eventType: WebhookEventType,
  ): Promise<void> {
    // 1. 주문 조회
    const order = await this.prisma.pg_payment_orders.findFirst({
      where: { id: paymentOrderId, merchant_id: merchantId },
    });

    if (!order) {
      this.logger.warn(
        `[Webhook] 주문 조회 실패 — paymentOrderId=${paymentOrderId}`,
      );
      return;
    }

    // 2. API 키에서 webhook 설정 조회
    const apiKey = await this.prisma.pg_api_keys.findFirst({
      where: { id: order.api_key_id },
    });

    if (!apiKey?.webhook_url || !apiKey?.webhook_secret) {
      this.logger.debug(
        `[Webhook] 가맹점 웹훅 URL/Secret 미설정 — skip`,
      );
      return;
    }

    // 3. secret 복호화
    const webhookSecret = await this.webhookCrypto.decryptSecret(apiKey.webhook_secret);

    // 4. 페이로드 생성
    const payload = this.buildPayload(order, eventType);

    // 5. HTTP 전송
    await this.sendWebhook(
      apiKey.webhook_url,
      webhookSecret,
      payload,
      paymentOrderId,
    );
  }

  /**
   * PENDING 상태 웹훅 재전송.
   * WebhookRetryService에서 주기적으로 호출.
   */
  async retryPending(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    // H-1: include로 관계 조인하여 N+1 쿼리 방지
    const pendingWebhooks = await this.prisma.pg_webhooks.findMany({
      where: {
        status: WEBHOOK_STATUS.PENDING,
        next_retry_at: { lte: new Date() },
      },
      orderBy: { next_retry_at: 'asc' },
      take: RETRY_BATCH_SIZE,
      include: {
        pg_payment_orders: {
          select: {
            id: true,
            api_key_id: true,
          },
        },
      },
    });

    if (pendingWebhooks.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    // H-1: apiKey를 한번에 조회 후 Map 캐싱
    const apiKeyIds = [
      ...new Set(
        pendingWebhooks
          .map((wh) => wh.pg_payment_orders?.api_key_id)
          .filter((id): id is string => id != null),
      ),
    ];

    const apiKeys = await this.prisma.pg_api_keys.findMany({
      where: { id: { in: apiKeyIds } },
    });

    const apiKeyMap = new Map(apiKeys.map((k) => [k.id, k]));

    let succeeded = 0;
    let failed = 0;

    for (const wh of pendingWebhooks) {
      const order = wh.pg_payment_orders;

      if (!order) {
        await this.prisma.pg_webhooks.update({
          where: { id: wh.id },
          data: { status: WEBHOOK_STATUS.FAILED },
        });
        failed++;
        continue;
      }

      const apiKey = apiKeyMap.get(order.api_key_id);

      if (!apiKey?.webhook_url || !apiKey?.webhook_secret) {
        await this.prisma.pg_webhooks.update({
          where: { id: wh.id },
          data: { status: WEBHOOK_STATUS.FAILED },
        });
        failed++;
        continue;
      }

      // C-1: secret 복호화
      let webhookSecret: string;
      try {
        webhookSecret = await this.webhookCrypto.decryptSecret(apiKey.webhook_secret);
      } catch {
        this.logger.error(
          `[Webhook] secret 복호화 실패 — webhookId=${wh.id}`,
        );
        await this.prisma.pg_webhooks.update({
          where: { id: wh.id },
          data: { status: WEBHOOK_STATUS.FAILED },
        });
        failed++;
        continue;
      }

      if (!isWebhookPayload(wh.payload)) {
        this.logger.error(
          `[Webhook] payload 형식 불일치 — webhookId=${wh.id}`,
        );
        await this.prisma.pg_webhooks.update({
          where: { id: wh.id },
          data: { status: WEBHOOK_STATUS.FAILED },
        });
        failed++;
        continue;
      }

      const payload: WebhookPayload = wh.payload;
      const body = JSON.stringify(payload);
      const signature = this.webhookCrypto.generateSignature(body, webhookSecret);

      const result = await this.webhookHttp.post(
        apiKey.webhook_url,
        body,
        signature,
        wh.id,
      );

      if (result.ok) {
        await this.prisma.pg_webhooks.update({
          where: { id: wh.id },
          data: {
            status: WEBHOOK_STATUS.SENT,
            sent_at: new Date(),
            response_status: result.status,
            response_body: result.body.substring(
              0,
              MAX_RESPONSE_BODY_LENGTH,
            ),
          },
        });
        succeeded++;
      } else if (result.error) {
        await this.scheduleRetry(
          wh.id,
          wh.retry_count,
          null,
          result.error,
        );
        failed++;
      } else {
        await this.scheduleRetry(
          wh.id,
          wh.retry_count,
          result.status,
          result.body,
        );
        failed++;
      }
    }

    return { processed: pendingWebhooks.length, succeeded, failed };
  }

  // ---- Private helpers ----

  private buildPayload(
    order: {
      payment_key: string;
      order_id: string;
      status: string;
      amount: bigint;
      approved_at: Date | null;
      cancel_amount: bigint | null;
      cancel_reason: string | null;
    },
    eventType: WebhookEventType,
  ): WebhookPayload {
    return {
      eventType,
      createdAt: new Date().toISOString(),
      data: {
        paymentKey: order.payment_key,
        orderId: order.order_id,
        status: order.status as PgPaymentStatusCode,
        amount: Number(order.amount),
        ...(order.approved_at !== null
          ? { approvedAt: order.approved_at.toISOString() }
          : {}),
        ...(order.cancel_amount !== null
          ? { cancelAmount: Number(order.cancel_amount) }
          : {}),
        ...(order.cancel_reason !== null
          ? { cancelReason: order.cancel_reason }
          : {}),
      },
    };
  }

  private async sendWebhook(
    webhookUrl: string,
    webhookSecret: string,
    payload: WebhookPayload,
    paymentOrderId: string,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.webhookCrypto.generateSignature(body, webhookSecret);

    // pg_webhooks 레코드 생성
    const webhook = await this.prisma.pg_webhooks.create({
      data: {
        payment_order_id: paymentOrderId,
        event_type: payload.eventType,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        status: WEBHOOK_STATUS.PENDING,
      },
    });

    const result = await this.webhookHttp.post(
      webhookUrl,
      body,
      signature,
      webhook.id,
    );

    if (result.ok) {
      await this.prisma.pg_webhooks.update({
        where: { id: webhook.id },
        data: {
          status: WEBHOOK_STATUS.SENT,
          sent_at: new Date(),
          response_status: result.status,
          response_body: result.body.substring(
            0,
            MAX_RESPONSE_BODY_LENGTH,
          ),
        },
      });
      this.logger.log(
        `[Webhook] 전송 성공 — webhookId=${webhook.id}`,
      );
    } else if (result.error) {
      await this.scheduleRetry(webhook.id, 0, null, result.error);
      this.logger.warn(
        `[Webhook] 전송 실패 — webhookId=${webhook.id} error=${result.error}`,
      );
    } else {
      await this.scheduleRetry(
        webhook.id,
        0,
        result.status,
        result.body,
      );
    }
  }

  private async scheduleRetry(
    webhookId: string,
    currentRetryCount: number,
    responseStatus: number | null,
    responseBody: string | null,
  ): Promise<void> {
    const nextRetryCount = currentRetryCount + 1;

    if (nextRetryCount > MAX_RETRIES) {
      await this.prisma.pg_webhooks.update({
        where: { id: webhookId },
        data: {
          status: WEBHOOK_STATUS.FAILED,
          retry_count: nextRetryCount,
          response_status: responseStatus,
          response_body:
            responseBody?.substring(0, MAX_RESPONSE_BODY_LENGTH) ?? null,
        },
      });
      this.logger.error(
        `[Webhook] 최대 재시도 초과 — webhookId=${webhookId}`,
      );
      return;
    }

    // 지수 백오프: 1분 * 2^retryCount
    const delayMs = BASE_DELAY_MS * Math.pow(2, currentRetryCount);
    const nextRetryAt = new Date(Date.now() + delayMs);

    await this.prisma.pg_webhooks.update({
      where: { id: webhookId },
      data: {
        retry_count: nextRetryCount,
        next_retry_at: nextRetryAt,
        response_status: responseStatus,
        response_body:
          responseBody?.substring(0, MAX_RESPONSE_BODY_LENGTH) ?? null,
      },
    });

    this.logger.log(
      `[Webhook] 재시도 예약 — webhookId=${webhookId} retry=${nextRetryCount}/${MAX_RETRIES} nextAt=${nextRetryAt.toISOString()}`,
    );
  }
}
