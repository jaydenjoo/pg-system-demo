'use client';

import { useState, useEffect, forwardRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { PaymentOrderResponse, CheckoutFormValues } from '@/types/payment';
import { createPaymentOrder, confirmPayment, PgApiError } from '@/lib/payment-client';

// ---- Luhn 알고리즘 (카드번호 유효성 검증) ----

function luhnCheck(value: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let n = parseInt(value[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// ---- Zod 스키마 ----

const checkoutSchema = z.object({
  orderId: z
    .string()
    .min(1, '주문번호를 입력해주세요')
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, '영문, 숫자, 하이픈, 언더스코어만 허용'),
  orderName: z.string().min(1, '상품명을 입력해주세요').max(256),
  amount: z.coerce
    .number({ invalid_type_error: '숫자를 입력해주세요' })
    .int('정수만 입력 가능합니다')
    .min(100, '최소 100원 이상')
    .max(100_000_000, '최대 1억원 이하'),
  cardNumber: z
    .string()
    .min(13, '카드번호 13~19자리')
    .max(19, '카드번호 13~19자리')
    .regex(/^\d+$/, '숫자만 입력해주세요')
    .refine(luhnCheck, '유효하지 않은 카드번호입니다'),
  expiryMonth: z
    .string()
    .length(2, 'MM 형식')
    .regex(/^(0[1-9]|1[0-2])$/, '01~12'),
  expiryYear: z
    .string()
    .length(2, 'YY 형식')
    .regex(/^\d{2}$/, '숫자 2자리'),
  cvv: z
    .string()
    .min(3, '3~4자리')
    .max(4, '3~4자리')
    .regex(/^\d+$/, '숫자만'),
  cardholderName: z.string().min(1, '카드 소유자명을 입력해주세요').max(64),
  customerEmail: z.string().email('올바른 이메일을 입력해주세요').or(z.literal('')),
  customerName: z.string().min(1, '주문자명을 입력해주세요').max(64),
  installmentMonths: z.coerce.number().int().min(0).max(36),
}).superRefine((data, ctx) => {
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  const expYear = parseInt(data.expiryYear, 10);
  const expMonth = parseInt(data.expiryMonth, 10);

  if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '유효기간이 만료된 카드입니다',
      path: ['expiryYear'],
    });
  }
});

// ---- 테스트 기본값 ----

function createDefaultValues(): CheckoutFormValues {
  return {
    orderId: `ORDER-${Date.now()}`,
    orderName: '테스트 상품',
    amount: 10000,
    cardNumber: '4111111111111111',
    expiryMonth: '12',
    expiryYear: '28',
    cvv: '123',
    cardholderName: '홍길동',
    customerEmail: 'test@example.com',
    customerName: '홍길동',
    installmentMonths: 0,
  };
}

// ---- 컴포넌트 ----

/** 기본 모드: secretKey로 주문 생성 + 승인 (데모용) */
interface PaymentFormDefaultProps {
  mode?: 'default';
  secretKey: string;
  onResult: (result: PaymentOrderResponse) => void;
  onError?: (error: { code: string; message: string }) => void;
}

/** iframe 모드: 주문은 이미 생성됨. confirm만 수행 */
interface PaymentFormIframeProps {
  mode: 'iframe';
  secretKey: string;
  paymentKey: string;
  orderId: string;
  amount: number;
  orderName: string;
  customerEmail?: string;
  customerName?: string;
  onResult: (result: PaymentOrderResponse) => void;
  onError?: (error: { code: string; message: string }) => void;
  onCancel?: () => void;
}

type PaymentFormProps = PaymentFormDefaultProps | PaymentFormIframeProps;

type PaymentStep = 'form' | 'processing';

export function PaymentForm(props: PaymentFormProps) {
  const { onResult, onError, secretKey } = props;
  const isIframe = props.mode === 'iframe';
  const [step, setStep] = useState<PaymentStep>('form');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [processingTimeout, setProcessingTimeout] = useState(false);

  // iframe 모드: 서버에서 전달받은 주문 정보로 기본값 설정
  // createDefaultValues()를 매 마운트마다 호출하여 고유한 orderId 생성
  const defaults = createDefaultValues();
  const defaultValues: CheckoutFormValues = isIframe
    ? {
        ...defaults,
        orderId: props.orderId,
        orderName: props.orderName,
        amount: props.amount,
        customerEmail: props.customerEmail ?? '',
        customerName: props.customerName ?? '',
      }
    : defaults;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues,
  });

  // Fix 6: 폼 수정 중 이탈 방지 (beforeunload)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Fix 7: 결제 처리 타임아웃 감지 (30초)
  useEffect(() => {
    if (step !== 'processing') {
      setProcessingTimeout(false);
      return;
    }
    const timer = setTimeout(() => setProcessingTimeout(true), 30_000);
    return () => clearTimeout(timer);
  }, [step]);

  const handleError = (err: unknown): void => {
    setStep('form');
    let code = 'UNKNOWN';
    let message = '결제 처리 중 알 수 없는 오류가 발생했습니다.';

    if (err instanceof PgApiError) {
      code = err.code;
      message = err.message;
      setErrorMessage(`[${code}] ${message}`);
    } else if (err instanceof Error) {
      message = err.message;
      setErrorMessage(message);
    } else {
      setErrorMessage(message);
    }

    onError?.({ code, message });
  };

  const onSubmit = async (values: CheckoutFormValues): Promise<void> => {
    // Fix 8: 오프라인 상태 감지
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMessage('인터넷 연결이 끊겼습니다. 연결 확인 후 다시 시도해주세요.');
      return;
    }
    setStep('processing');
    setErrorMessage(null);

    try {
      if (isIframe) {
        // iframe 모드: 주문 이미 생성됨, confirm만 수행
        const confirmed = await confirmPayment(secretKey, {
          paymentKey: props.paymentKey,
          orderId: props.orderId,
          amount: props.amount,
          cardNumber: values.cardNumber,
          installmentMonths: values.installmentMonths,
        });
        onResult(confirmed);
      } else {
        // 기본 모드: 주문 생성 + 승인
        const order = await createPaymentOrder(secretKey, {
          orderId: values.orderId,
          amount: values.amount,
          orderName: values.orderName,
          paymentMethod: 'CARD',
          customerEmail: values.customerEmail !== '' ? values.customerEmail : undefined,
          customerName: values.customerName !== '' ? values.customerName : undefined,
        });

        const confirmed = await confirmPayment(secretKey, {
          paymentKey: order.paymentKey,
          orderId: values.orderId,
          amount: values.amount,
          cardNumber: values.cardNumber,
          installmentMonths: values.installmentMonths,
        });
        onResult(confirmed);
      }
    } catch (err: unknown) {
      handleError(err);
    }
  };

  if (step === 'processing') {
    return (
      <div className="text-center py-12 space-y-4">
        {processingTimeout ? (
          <>
            <p className="text-sm text-red-600">결제 처리 시간이 초과되었습니다.</p>
            <p className="text-xs text-gray-500">네트워크 상태를 확인하고 다시 시도해주세요.</p>
            <button
              type="button"
              onClick={() => setStep('form')}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
            >
              돌아가기
            </button>
          </>
        ) : (
          <>
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
            <p className="text-sm text-gray-600">결제를 처리하고 있습니다...</p>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-5">
      {/* 주문 정보 — iframe 모드에서는 요약만 표시 */}
      {isIframe ? (
        <div className="rounded-lg bg-gray-50 p-4 space-y-1">
          <p className="text-sm font-semibold text-gray-700">{props.orderName}</p>
          <p className="text-lg font-bold text-gray-900">
            {props.amount.toLocaleString('ko-KR')}원
          </p>
        </div>
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-700 mb-2">주문 정보</legend>
          <FormField
            label="주문번호"
            id="orderId"
            error={errors.orderId?.message}
            {...register('orderId')}
          />
          <FormField
            label="상품명"
            id="orderName"
            error={errors.orderName?.message}
            {...register('orderName')}
          />
          <FormField
            label="결제 금액 (원)"
            id="amount"
            type="number"
            error={errors.amount?.message}
            {...register('amount')}
          />
        </fieldset>
      )}

      {/* 주문자 정보 — iframe 모드에서는 숨김 (이미 서버에서 전달됨) */}
      {!isIframe && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-700 mb-2">주문자 정보</legend>
          <FormField
            label="주문자명"
            id="customerName"
            error={errors.customerName?.message}
            {...register('customerName')}
          />
          <FormField
            label="이메일"
            id="customerEmail"
            type="email"
            error={errors.customerEmail?.message}
            {...register('customerEmail')}
          />
        </fieldset>
      )}

      {/* 카드 정보 */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700 mb-2">카드 정보</legend>
        <div className="relative">
          <FormField
            label="카드번호"
            id="cardNumber"
            type={showCardNumber ? 'text' : 'password'}
            inputMode="numeric"
            placeholder="4111111111111111"
            maxLength={19}
            error={errors.cardNumber?.message}
            {...register('cardNumber')}
          />
          <button
            type="button"
            onClick={() => setShowCardNumber((prev) => !prev)}
            className="absolute right-2 top-6 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showCardNumber ? '숨기기' : '보기'}
          </button>
        </div>
        <FormField
          label="카드 소유자명"
          id="cardholderName"
          error={errors.cardholderName?.message}
          {...register('cardholderName')}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField
            label="유효기간(MM)"
            id="expiryMonth"
            placeholder="MM"
            maxLength={2}
            error={errors.expiryMonth?.message}
            {...register('expiryMonth')}
          />
          <FormField
            label="유효기간(YY)"
            id="expiryYear"
            placeholder="YY"
            maxLength={2}
            error={errors.expiryYear?.message}
            {...register('expiryYear')}
          />
          <FormField
            label="CVV"
            id="cvv"
            type="password"
            placeholder="***"
            maxLength={4}
            error={errors.cvv?.message}
            {...register('cvv')}
          />
        </div>
        <div>
          <label htmlFor="installmentMonths" className="block text-xs font-medium text-gray-600 mb-1">
            할부
          </label>
          <select
            id="installmentMonths"
            {...register('installmentMonths')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={0}>일시불</option>
            {[2, 3, 4, 5, 6, 9, 12, 18, 24, 36].map((m) => (
              <option key={m} value={m}>
                {m}개월
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* 에러 메시지 */}
      {errorMessage !== null && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* 결제 / 취소 버튼 */}
      <div className={isIframe ? 'flex gap-3' : ''}>
        {isIframe && props.onCancel !== undefined && (
          <button
            type="button"
            onClick={props.onCancel}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isIframe ? 'flex-[2]' : 'w-full'
          }`}
        >
          {isIframe
            ? `${props.amount.toLocaleString('ko-KR')}원 결제하기`
            : '결제하기'}
        </button>
      </div>

      {!isIframe && (
        <p className="text-xs text-gray-400 text-center">
          Mock 카드사를 사용하는 테스트 결제입니다. 실제 청구되지 않습니다.
        </p>
      )}
    </form>
  );
}

// ---- 내부 컴포넌트 ----

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
}

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, id, error, ...rest }, ref) => (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        {...rest}
        className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
          error !== undefined
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
        }`}
      />
      {error !== undefined && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  ),
);
FormField.displayName = 'FormField';
