'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useChangePassword } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해주세요.'),
    newPassword: z
      .string()
      .min(12, '비밀번호는 최소 12자 이상이어야 합니다.')
      .regex(/[a-zA-Z]/, '영문자를 포함해야 합니다.')
      .regex(/[0-9]/, '숫자를 포함해야 합니다.'),
    confirmPassword: z.string().min(1, '비밀번호 확인을 입력해주세요.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '새 비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export function PasswordChangeForm() {
  const { changePassword, isLoading } = useChangePassword();
  const { success, error: toastError } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  async function onSubmit(values: PasswordFormValues) {
    const ok = await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });

    if (ok) {
      success('비밀번호가 변경되었습니다.');
      reset();
    } else {
      toastError('비밀번호 변경에 실패했습니다. 현재 비밀번호를 확인해주세요.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <p className="font-medium">비밀번호 정책 (PCI DSS 8.3.6)</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-blue-600">
          <li>최소 12자 이상</li>
          <li>영문자 포함 필수</li>
          <li>숫자 포함 필수</li>
        </ul>
      </div>

      <Input
        label="현재 비밀번호 *"
        type="password"
        {...register('currentPassword')}
        error={errors.currentPassword?.message}
        autoComplete="current-password"
      />

      <Input
        label="새 비밀번호 *"
        type="password"
        {...register('newPassword')}
        error={errors.newPassword?.message}
        autoComplete="new-password"
      />

      <Input
        label="새 비밀번호 확인 *"
        type="password"
        {...register('confirmPassword')}
        error={errors.confirmPassword?.message}
        autoComplete="new-password"
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? '변경 중...' : '비밀번호 변경'}
        </Button>
      </div>
    </form>
  );
}
