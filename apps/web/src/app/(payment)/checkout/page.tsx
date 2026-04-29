'use client';

import { useState } from 'react';
import { PaymentForm } from '@/components/payment/payment-form';
import { PaymentResult } from '@/components/payment/payment-result';
import type { PaymentOrderResponse } from '@/types/payment';

// 데모용 기본 Secret Key — 시드 데이터에서 생성되는 키로 교체 필요
const DEMO_SECRET_KEY = 'test_sk_demo_0000000000000000000000000000000000000000000000000000';

type CheckoutStep = 'checkout' | 'result';

export default function CheckoutPage() {
  const [step, setStep] = useState<CheckoutStep>('checkout');
  const [result, setResult] = useState<PaymentOrderResponse | null>(null);

  const handleResult = (paymentResult: PaymentOrderResponse): void => {
    setResult(paymentResult);
    setStep('result');
  };

  const handleReset = (): void => {
    setResult(null);
    setStep('checkout');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">PG System 결제 테스트</h1>
          <p className="mt-1 text-sm text-gray-500">
            Mock 카드사 기반 테스트 결제 — 실제 청구되지 않습니다.
          </p>
        </div>

        {/* 콘텐츠 카드 */}
        <div className="bg-white rounded-xl shadow-md p-6 sm:p-8">
          {step === 'checkout' && (
            <PaymentForm secretKey={DEMO_SECRET_KEY} onResult={handleResult} />
          )}

          {step === 'result' && result !== null && (
            <PaymentResult result={result} onReset={handleReset} />
          )}
        </div>
      </div>
    </div>
  );
}
