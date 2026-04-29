// ============================================================
// PG Gateway — 웹훅 HTTP 전송 서비스 (SRP 분리)
// fetch + AbortController 타임아웃 처리
// ============================================================

import { Injectable } from '@nestjs/common';

/** fetch 타임아웃 (밀리초) */
const FETCH_TIMEOUT_MS = 5_000;

export type WebhookHttpResult =
  | { ok: true; status: number; body: string; error?: undefined }
  | { ok: false; status: number; body: string; error?: undefined }
  | { ok: false; status: null; body: string; error: string };

@Injectable()
export class WebhookHttpService {
  async post(
    url: string,
    body: string,
    signature: string,
    webhookId: string,
  ): Promise<WebhookHttpResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': webhookId,
        },
        body,
        signal: controller.signal,
      });

      const responseBody = await response.text().catch(() => '');

      return response.ok
        ? { ok: true, status: response.status, body: responseBody }
        : { ok: false, status: response.status, body: responseBody };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, status: null, body: errorMessage, error: errorMessage };
    } finally {
      clearTimeout(timeout);
    }
  }
}
