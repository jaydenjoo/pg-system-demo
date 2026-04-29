'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  loginId: z.string().min(1, '아이디를 입력해주세요'),
  password: z.string().min(1, '비밀번호를 입력해주세요'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: values.loginId, password: values.password }),
        credentials: 'include',
      });

      const data = (await res.json()) as {
        data?: {
          requireMfa?: boolean;
          userType?: 'ADMIN' | 'AGENT' | 'MERCHANT';
        };
        error?: { message: string };
      };

      if (!res.ok) {
        setErrorMessage(data.error?.message ?? '로그인에 실패했습니다');
        return;
      }

      if (data.data?.requireMfa === true) {
        window.location.href = '/login/mfa';
        return;
      }

      // userType별 대시보드로 리다이렉트
      const userType = data.data?.userType;
      if (userType === 'MERCHANT') {
        window.location.href = '/m/dashboard';
      } else if (userType === 'AGENT') {
        window.location.href = '/a/dashboard';
      } else {
        window.location.href = '/dashboard';
      }
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
          <h1 className="text-2xl font-bold text-gray-900">PG System</h1>
          <p className="mt-1 text-sm text-gray-500">통합 로그인</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="mt-8 space-y-5">
          <div>
            <label htmlFor="loginId" className="block text-sm font-medium text-gray-700">
              아이디
            </label>
            <input
              id="loginId"
              type="text"
              autoComplete="off"
              {...register('loginId')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="로그인 아이디"
            />
            {errors.loginId !== undefined && (
              <p className="mt-1 text-xs text-red-600">{errors.loginId.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="off"
              {...register('password')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="비밀번호"
            />
            {errors.password !== undefined && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
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
            className="w-full flex justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
