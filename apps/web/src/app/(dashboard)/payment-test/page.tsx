"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  RotateCcw,
  Ban,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { PaymentOrderResponse } from "@/types/payment";
import { PaymentForm } from "@/components/payment/payment-form";
import { cancelPayment, PgApiError } from "@/lib/payment-client";

// 시드 데이터의 데모 시크릿 키
const DEMO_SECRET_KEY =
  "test_sk_demo_0000000000000000000000000000000000000000000000000000";

type TestPhase = "form" | "result";

export default function PaymentTestPage() {
  const [phase, setPhase] = useState<TestPhase>("form");
  const [result, setResult] = useState<PaymentOrderResponse | null>(null);
  const [error, setError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] =
    useState<PaymentOrderResponse | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleResult = useCallback((res: PaymentOrderResponse) => {
    setResult(res);
    setError(null);
    setPhase("result");
  }, []);

  const handleError = useCallback(
    (err: { code: string; message: string }) => {
      setError(err);
      setResult(null);
      setPhase("result");
    },
    [],
  );

  const handleReset = useCallback(() => {
    setPhase("form");
    setResult(null);
    setError(null);
    setCancelResult(null);
    setCancelError(null);
  }, []);

  const handleCancel = useCallback(async () => {
    if (result === null) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await cancelPayment(
        DEMO_SECRET_KEY,
        result.paymentKey,
        { cancelReason: "관리자 테스트 취소" },
      );
      setCancelResult(res);
    } catch (err: unknown) {
      if (err instanceof PgApiError) {
        setCancelError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setCancelError(err.message);
      } else {
        setCancelError("취소 처리 중 오류가 발생했습니다.");
      }
    } finally {
      setCancelLoading(false);
    }
  }, [result]);

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">결제 테스트</h1>
        <p className="mt-1 text-sm text-gray-500">
          Mock 카드사를 사용한 테스트 결제입니다. 실제 청구되지 않습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 결제 폼 or 결과 */}
        <div className="lg:col-span-2 space-y-6">
          {phase === "form" && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                결제 요청
              </h2>
              <PaymentForm
                secretKey={DEMO_SECRET_KEY}
                onResult={handleResult}
                onError={handleError}
              />
            </div>
          )}

          {phase === "result" && (
            <div className="space-y-4">
              {/* 결제 성공 */}
              {result !== null && error === null && (
                <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        결제 성공
                      </h2>
                      <p className="text-sm text-gray-500">
                        {result.approvedAt !== null
                          ? new Date(result.approvedAt).toLocaleString("ko-KR")
                          : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <ResultField label="상태" value={result.status} />
                    <ResultField
                      label="금액"
                      value={`${result.amount.toLocaleString("ko-KR")}원`}
                    />
                    <ResultField label="주문번호" value={result.orderId} />
                    <ResultField label="상품명" value={result.orderName} />
                    <ResultField
                      label="Payment Key"
                      value={result.paymentKey}
                      mono
                    />
                    <ResultField
                      label="결제수단"
                      value={result.paymentMethod ?? "-"}
                    />
                    {result.card != null && (
                      <>
                        <ResultField
                          label="카드사"
                          value={result.card.company}
                        />
                        <ResultField
                          label="승인번호"
                          value={result.card.approveNo}
                        />
                      </>
                    )}
                  </div>

                  {/* 취소 버튼 */}
                  {cancelResult === null && (
                    <div className="pt-4 border-t">
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={cancelLoading}
                        className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Ban className="h-4 w-4" />
                        {cancelLoading ? "취소 처리중..." : "이 결제 취소하기"}
                      </button>
                    </div>
                  )}

                  {/* 취소 에러 */}
                  {cancelError !== null && (
                    <div className="rounded-md bg-red-50 border border-red-200 p-3">
                      <p className="text-sm text-red-700">{cancelError}</p>
                    </div>
                  )}

                  {/* 취소 성공 */}
                  {cancelResult !== null && (
                    <div className="rounded-md bg-orange-50 border border-orange-200 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-semibold text-orange-700">
                          취소 완료
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <ResultField
                          label="상태"
                          value={cancelResult.status}
                        />
                        <ResultField
                          label="Payment Key"
                          value={cancelResult.paymentKey}
                          mono
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 결제 실패 */}
              {error !== null && (
                <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                      <XCircle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        결제 실패
                      </h2>
                    </div>
                  </div>
                  <div className="rounded-md bg-red-50 border border-red-200 p-4 space-y-1">
                    <p className="text-sm font-medium text-red-800">
                      에러 코드: {error.code}
                    </p>
                    <p className="text-sm text-red-700">{error.message}</p>
                  </div>
                </div>
              )}

              {/* 다시 테스트 */}
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                새 결제 테스트
              </button>
            </div>
          )}
        </div>

        {/* 우측: 테스트 가이드 */}
        <div className="space-y-4">
          {/* 테스트 카드 정보 */}
          <div className="bg-white rounded-lg shadow-sm border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">
                테스트 카드
              </h3>
            </div>
            <div className="space-y-2 text-sm">
              <GuideRow label="카드번호" value="4111 1111 1111 1111" />
              <GuideRow label="유효기간" value="12/28" />
              <GuideRow label="CVV" value="123" />
              <GuideRow label="소유자" value="홍길동" />
            </div>
          </div>

          {/* Mock 카드사 시나리오 */}
          <div className="bg-white rounded-lg shadow-sm border p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              시나리오별 테스트 (금액 끝 2자리)
            </h3>
            <div className="space-y-2">
              <ScenarioRow
                amount="XX99"
                label="카드 거절"
                color="red"
              />
              <ScenarioRow
                amount="XX98"
                label="타임아웃"
                color="yellow"
              />
              <ScenarioRow
                amount="XX97"
                label="잔액 부족"
                color="orange"
              />
              <ScenarioRow
                amount="그 외"
                label="정상 승인"
                color="green"
              />
            </div>
            <p className="text-xs text-gray-400 pt-1">
              예: 10099원 → 카드 거절, 10000원 → 정상 승인
            </p>
          </div>

          {/* API 키 정보 */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-5 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              사용 중인 API 키
            </h3>
            <p className="text-xs text-gray-500 break-all font-mono">
              test_sk_demo_0000...
            </p>
            <p className="text-xs text-gray-400">
              시드 데이터의 테스트가맹점(MCH-TEST-001) 키입니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- 내부 컴포넌트 ----

function ResultField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd
        className={`mt-0.5 text-sm text-gray-900 ${mono ? "font-mono text-xs break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

const SCENARIO_COLORS = {
  red: "bg-red-100 text-red-700",
  yellow: "bg-yellow-100 text-yellow-700",
  orange: "bg-orange-100 text-orange-700",
  green: "bg-green-100 text-green-700",
} as const;

function ScenarioRow({
  amount,
  label,
  color,
}: {
  amount: string;
  label: string;
  color: keyof typeof SCENARIO_COLORS;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
        {amount}
      </code>
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium ${SCENARIO_COLORS[color]}`}
      >
        {label}
      </span>
    </div>
  );
}

function GuideRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <code className="font-mono text-gray-900">{value}</code>
    </div>
  );
}
