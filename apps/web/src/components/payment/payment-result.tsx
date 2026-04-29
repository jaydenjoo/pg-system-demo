'use client';

import type { PaymentOrderResponse } from '@/types/payment';

interface PaymentResultProps {
  result: PaymentOrderResponse;
  onReset: () => void;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DONE: { label: '결제 완료', color: 'text-green-700 bg-green-50 border-green-200' },
  CANCELED: { label: '결제 취소', color: 'text-red-700 bg-red-50 border-red-200' },
  ABORTED: { label: '결제 실패', color: 'text-red-700 bg-red-50 border-red-200' },
  READY: { label: '결제 대기', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  IN_PROGRESS: { label: '결제 진행중', color: 'text-blue-700 bg-blue-50 border-blue-200' },
};

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function PaymentResult({ result, onReset }: PaymentResultProps) {
  const statusInfo = STATUS_MAP[result.status] ?? {
    label: result.status,
    color: 'text-gray-700 bg-gray-50 border-gray-200',
  };
  const isSuccess = result.status === 'DONE';

  return (
    <div className="space-y-6">
      {/* 상태 배너 */}
      <div className={`rounded-lg border p-4 text-center ${statusInfo.color}`}>
        <div className="text-3xl mb-2">{isSuccess ? '\u2713' : '\u2717'}</div>
        <h2 className="text-xl font-bold">{statusInfo.label}</h2>
      </div>

      {/* 결제 정보 */}
      <div className="space-y-3 text-sm">
        <InfoRow label="주문번호" value={result.orderId} />
        <InfoRow label="상품명" value={result.orderName} />
        <InfoRow label="결제 금액" value={`${formatAmount(result.amount)}원`} />
        <InfoRow label="결제 키" value={result.paymentKey} mono />
        {result.paymentMethod !== null && (
          <InfoRow label="결제 수단" value={result.paymentMethod} />
        )}
        <InfoRow label="요청 시각" value={formatDate(result.requestedAt)} />
        {result.approvedAt !== null && (
          <InfoRow label="승인 시각" value={formatDate(result.approvedAt)} />
        )}

        {/* 카드 정보 */}
        {result.card != null && (
          <div className="mt-4 rounded-md bg-gray-50 p-3 space-y-2">
            <p className="font-medium text-gray-700">카드 정보</p>
            <InfoRow label="카드사" value={result.card.company} />
            <InfoRow label="카드번호" value={result.card.number} mono />
            <InfoRow label="승인번호" value={result.card.approveNo} mono />
            <InfoRow label="카드타입" value={result.card.cardType} />
            <InfoRow
              label="할부"
              value={
                result.card.installmentPlanMonths === 0
                  ? '일시불'
                  : `${result.card.installmentPlanMonths}개월`
              }
            />
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <button
        onClick={onReset}
        className="w-full rounded-md bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
      >
        새 결제 테스트
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span
        className={`text-gray-900 text-right ml-4 break-all ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
