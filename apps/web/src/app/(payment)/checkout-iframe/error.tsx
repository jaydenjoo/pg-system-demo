'use client';

interface CheckoutIframeErrorProps {
  error: Error;
  reset: () => void;
}

export default function CheckoutIframeError({ error, reset }: CheckoutIframeErrorProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-sm p-6 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50">
          <span className="text-red-500 text-xl font-bold">!</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">결제창 오류</h2>
        <p className="text-sm text-gray-600">
          {error.message || '결제창을 불러오는 중 오류가 발생했습니다.'}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
