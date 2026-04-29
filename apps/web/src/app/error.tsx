"use client";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-700">
          오류가 발생했습니다
        </h2>
        <p className="mt-2 text-gray-500">
          예상치 못한 오류가 발생했습니다. 다시 시도해주세요.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-gray-400">
            오류 코드: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-6 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
