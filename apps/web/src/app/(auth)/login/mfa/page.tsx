'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const mfaSchema = z.object({
  code: z
    .string()
    .length(6, '인증코드는 6자리입니다')
    .regex(/^\d{6}$/, '숫자만 입력해주세요'),
});

type MfaFormValues = z.infer<typeof mfaSchema>;

export default function MfaPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MfaFormValues>({
    resolver: zodResolver(mfaSchema),
  });

  const onSubmit = async (values: MfaFormValues) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/auth/login/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: values.code }),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: { message: string } };
        setErrorMessage(data.error?.message ?? 'MFA 인증에 실패했습니다');
        return;
      }

      window.location.href = '/dashboard';
    } catch {
      setErrorMessage('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 p-8 bg-white rounded-xl shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">2단계 인증</h1>
          <p className="mt-1 text-sm text-gray-500">
            인증 앱에 표시된 6자리 코드를 입력하세요
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700">
              인증 코드
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              {...register('code')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-2xl tracking-widest shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="000000"
            />
            {errors.code !== undefined && (
              <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>
            )}
          </div>

          {errorMessage !== null && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '확인 중...' : '확인'}
          </button>

          <p className="text-center text-sm text-gray-500">
            <a href="/login" className="text-blue-600 hover:underline">
              처음부터 다시 로그인
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
