'use client';

interface CheckoutErrorProps {
  error: Error;
  reset: () => void;
}

export default function CheckoutError({ error, reset }: CheckoutErrorProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-md text-center space-y-4">
        <div className="text-red-500 text-4xl">!</div>
        <h2 className="text-xl font-bold text-gray-900">결제 페이지 오류</h2>
        <p className="text-sm text-gray-600">
          {error.message || '페이지를 불러오는 중 오류가 발생했습니다.'}
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
