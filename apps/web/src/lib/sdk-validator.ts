// ============================================================
// SDK postMessage 검증기
// - Zod 스키마로 메시지 구조 검증
// - origin 화이트리스트 검증 (양방향)
// ============================================================

import { z } from 'zod';
import {
  SDK_TO_IFRAME_TYPES,
  IFRAME_TO_SDK_TYPES,
} from '@/types/sdk-protocol';

// ---- SDK → iframe 메시지 스키마 ----

const sdkInitSchema = z.object({
  type: z.literal(SDK_TO_IFRAME_TYPES.INIT),
  paymentKey: z.string().min(1),
  clientKey: z.string().min(1),
  amount: z.number().int().positive(),
  orderName: z.string().min(1),
  orderId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
});

const sdkCloseSchema = z.object({
  type: z.literal(SDK_TO_IFRAME_TYPES.CLOSE),
});

export const sdkToIframeSchema = z.discriminatedUnion('type', [
  sdkInitSchema,
  sdkCloseSchema,
]);

// ---- iframe → SDK 메시지 스키마 ----

const iframeReadySchema = z.object({
  type: z.literal(IFRAME_TO_SDK_TYPES.READY),
});

const iframeConfirmSuccessSchema = z.object({
  type: z.literal(IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS),
  paymentKey: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  approvedAt: z.string().min(1),
});

const iframeConfirmFailSchema = z.object({
  type: z.literal(IFRAME_TO_SDK_TYPES.CONFIRM_FAIL),
  code: z.string().min(1),
  message: z.string().min(1),
  orderId: z.string().min(1),
});

const iframeCancelSchema = z.object({
  type: z.literal(IFRAME_TO_SDK_TYPES.CANCEL),
  orderId: z.string().min(1),
});

const iframeResizeSchema = z.object({
  type: z.literal(IFRAME_TO_SDK_TYPES.RESIZE),
  height: z.number().int().positive(),
});

const iframeErrorSchema = z.object({
  type: z.literal(IFRAME_TO_SDK_TYPES.ERROR),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const iframeToSdkSchema = z.discriminatedUnion('type', [
  iframeReadySchema,
  iframeConfirmSuccessSchema,
  iframeConfirmFailSchema,
  iframeCancelSchema,
  iframeResizeSchema,
  iframeErrorSchema,
]);

// ---- origin 검증 ----

/**
 * PG 시스템 도메인인지 확인 (iframe 내부에서 SDK 메시지 origin 검증용)
 * 프로덕션에서는 환경변수로 설정된 도메인만 허용
 */
export function isPgSystemOrigin(origin: string): boolean {
  const pgOrigin = process.env.NEXT_PUBLIC_PG_ORIGIN ?? 'http://localhost:3500';
  return origin === pgOrigin;
}

/**
 * 허용된 가맹점 origin인지 확인 (SDK에서 iframe 메시지 origin 검증용)
 * 결제창 iframe은 항상 PG 시스템 도메인에서 로드됨
 */
export function isAllowedCheckoutOrigin(origin: string): boolean {
  const checkoutOrigin =
    process.env.NEXT_PUBLIC_CHECKOUT_ORIGIN ?? 'http://localhost:3500';
  return origin === checkoutOrigin;
}

// ---- 메시지 파싱 유틸 ----

export type SdkMessageParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * SDK → iframe 메시지 파싱 + 검증
 */
export function parseSdkToIframeMessage(
  data: unknown,
): SdkMessageParseResult<z.infer<typeof sdkToIframeSchema>> {
  const result = sdkToIframeSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

/**
 * iframe → SDK 메시지 파싱 + 검증
 */
export function parseIframeToSdkMessage(
  data: unknown,
): SdkMessageParseResult<z.infer<typeof iframeToSdkSchema>> {
  const result = iframeToSdkSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
