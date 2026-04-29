'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { PaymentForm } from '@/components/payment/payment-form';
import type { PaymentOrderResponse } from '@/types/payment';
import { IFRAME_TO_SDK_TYPES } from '@/types/sdk-protocol';
import type { IframeToSdkMessage } from '@/types/sdk-protocol';
import { parseSdkToIframeMessage } from '@/lib/sdk-validator';

// ---- 타입 ----

interface CheckoutParams {
  paymentKey: string;
  clientKey: string;
}

interface VerifiedOrder {
  paymentKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  secretKey: string;
  merchantName: string;
  customerEmail?: string;
  customerName?: string;
}

type IframeStep = 'loading' | 'ready' | 'error';

const PG_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

// ---- 유틸 ----

function getSearchParams(): CheckoutParams | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const paymentKey = params.get('paymentKey');
  const clientKey = params.get('clientKey');
  if (paymentKey === null || clientKey === null) return null;
  return { paymentKey, clientKey };
}

function postToParent(message: IframeToSdkMessage): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  // SDK 도메인에 메시지 전송 — origin은 '*' 대신 검증은 SDK 측에서 수행
  // iframe → SDK: 우리가 보내는 메시지이므로 targetOrigin을 '*'로 설정
  // (SDK가 어떤 도메인에서 로드되었는지 iframe은 알 수 없음)
  window.parent.postMessage(message, '*');
}

// ---- 컴포넌트 ----

export default function CheckoutIframePage() {
  const [step, setStep] = useState<IframeStep>('loading');
  const [order, setOrder] = useState<VerifiedOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const sdkOriginRef = useRef<string | null>(null);
  const initReceivedRef = useRef(false);

  // SDK → iframe 메시지 핸들러
  const handleMessage = useCallback((event: MessageEvent): void => {
    // origin 검증: 최초 INIT 메시지의 origin을 기억
    if (sdkOriginRef.current !== null && event.origin !== sdkOriginRef.current) {
      return;
    }

    const parsed = parseSdkToIframeMessage(event.data);
    if (!parsed.success) return;

    const msg = parsed.data;

    if (msg.type === 'PG_INIT' && !initReceivedRef.current) {
      initReceivedRef.current = true;
      sdkOriginRef.current = event.origin;

      // verify API 호출
      verifyAndSetup(msg.paymentKey, msg.clientKey, {
        amount: msg.amount,
        orderName: msg.orderName,
        orderId: msg.orderId,
        ...(msg.customerEmail !== undefined && { customerEmail: msg.customerEmail }),
        ...(msg.customerName !== undefined && { customerName: msg.customerName }),
      });
    }
  }, []);

  // URL params 기반 직접 접근 (SDK 없이 디버깅용)
  useEffect(() => {
    const params = getSearchParams();
    if (params !== null && !initReceivedRef.current) {
      // URL params가 있으면 verify API로 주문 정보 가져오기
      verifyFromParams(params.paymentKey, params.clientKey);
    }
  }, []);

  // postMessage 리스너 등록
  useEffect(() => {
    window.addEventListener('message', handleMessage);

    // iframe 로드 완료 → SDK에 READY 전송
    postToParent({ type: IFRAME_TO_SDK_TYPES.READY });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  // iframe 높이 자동 리사이즈
  useEffect(() => {
    if (step !== 'ready') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.ceil(entry.contentRect.height);
        postToParent({ type: IFRAME_TO_SDK_TYPES.RESIZE, height });
      }
    });

    observer.observe(document.body);
    return () => observer.disconnect();
  }, [step]);

  async function verifyFromParams(paymentKey: string, clientKey: string): Promise<void> {
    try {
      const res = await fetch(
        `${PG_API_BASE}/pg/v1/payments/checkout/verify?paymentKey=${encodeURIComponent(paymentKey)}&clientKey=${encodeURIComponent(clientKey)}`,
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new Error(body.error?.message ?? '결제 정보를 확인할 수 없습니다.');
      }

      const json = (await res.json()) as {
        data: {
          paymentKey: string;
          orderId: string;
          orderName: string;
          amount: number;
          merchantName: string;
        };
      };

      setOrder({
        paymentKey: json.data.paymentKey,
        orderId: json.data.orderId,
        orderName: json.data.orderName,
        amount: json.data.amount,
        merchantName: json.data.merchantName,
        // URL params 직접 접근 시 secretKey는 데모용 키 사용
        secretKey: 'test_sk_demo_0000000000000000000000000000000000000000000000000000',
      });
      setStep('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      setErrorMsg(message);
      setStep('error');
      postToParent({
        type: IFRAME_TO_SDK_TYPES.ERROR,
        code: 'VERIFY_FAILED',
        message,
      });
    }
  }

  async function verifyAndSetup(
    paymentKey: string,
    clientKey: string,
    initData: {
      amount: number;
      orderName: string;
      orderId: string;
      customerEmail?: string;
      customerName?: string;
    },
  ): Promise<void> {
    try {
      const res = await fetch(
        `${PG_API_BASE}/pg/v1/payments/checkout/verify?paymentKey=${encodeURIComponent(paymentKey)}&clientKey=${encodeURIComponent(clientKey)}`,
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new Error(body.error?.message ?? '결제 정보를 확인할 수 없습니다.');
      }

      const json = (await res.json()) as {
        data: {
          paymentKey: string;
          orderId: string;
          orderName: string;
          amount: number;
          merchantName: string;
        };
      };

      // 금액 변조 방지: SDK에서 전달받은 금액과 서버 금액 비교
      if (json.data.amount !== initData.amount) {
        throw new Error('결제 금액이 일치하지 않습니다.');
      }

      setOrder({
        paymentKey: json.data.paymentKey,
        orderId: json.data.orderId,
        orderName: json.data.orderName,
        amount: json.data.amount,
        merchantName: json.data.merchantName,
        // iframe에서는 confirm API용 secretKey가 필요
        // verify 응답에는 포함하지 않음 → 데모용 키 사용
        secretKey: 'test_sk_demo_0000000000000000000000000000000000000000000000000000',
        ...(initData.customerEmail !== undefined && { customerEmail: initData.customerEmail }),
        ...(initData.customerName !== undefined && { customerName: initData.customerName }),
      });
      setStep('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      setErrorMsg(message);
      setStep('error');
      postToParent({
        type: IFRAME_TO_SDK_TYPES.ERROR,
        code: 'VERIFY_FAILED',
        message,
      });
    }
  }

  const handleResult = (result: PaymentOrderResponse): void => {
    postToParent({
      type: IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS,
      paymentKey: result.paymentKey,
      orderId: result.orderId,
      amount: result.amount,
      approvedAt: result.approvedAt ?? new Date().toISOString(),
    });
  };

  const handleError = (error: { code: string; message: string }): void => {
    postToParent({
      type: IFRAME_TO_SDK_TYPES.CONFIRM_FAIL,
      code: error.code,
      message: error.message,
      orderId: order?.orderId ?? '',
    });
  };

  const handleCancel = (): void => {
    postToParent({
      type: IFRAME_TO_SDK_TYPES.CANCEL,
      orderId: order?.orderId ?? '',
    });
  };

  // ---- 렌더링 ----

  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
          <p className="text-sm text-gray-500">결제 정보를 확인하고 있습니다...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-full max-w-sm p-6 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50">
            <span className="text-red-500 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">결제를 진행할 수 없습니다</h2>
          <p className="text-sm text-gray-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (order === null) return null;

  return (
    <div className="min-h-screen bg-white py-6 px-4">
      <div className="mx-auto max-w-md">
        {/* 가맹점 정보 */}
        <div className="text-center mb-6">
          <p className="text-xs text-gray-400">{order.merchantName}</p>
        </div>

        {/* 결제 폼 (iframe 모드) */}
        <PaymentForm
          mode="iframe"
          secretKey={order.secretKey}
          paymentKey={order.paymentKey}
          orderId={order.orderId}
          amount={order.amount}
          orderName={order.orderName}
          {...(order.customerEmail !== undefined && { customerEmail: order.customerEmail })}
          {...(order.customerName !== undefined && { customerName: order.customerName })}
          onResult={handleResult}
          onError={handleError}
          onCancel={handleCancel}
        />

        <p className="mt-4 text-xs text-gray-300 text-center">
          PG System 보안 결제창
        </p>
      </div>
    </div>
  );
}
