"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { useUpdateProfile } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const profileSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요.").max(50),
  email: z
    .string()
    .email("올바른 이메일 형식을 입력해주세요.")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .regex(/^[0-9-]+$/, "숫자와 하이픈만 입력 가능합니다.")
    .optional()
    .or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileInfo() {
  const { user, mutate } = useUser();
  const { success, error: toastError } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", email: "", phone: "" },
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name ?? "",
        email: user.email ?? "",
        phone: user.phone ?? "",
      });
    }
  }, [user, reset]);

  const { updateProfile, isLoading: updateLoading } = useUpdateProfile();

  async function onSubmit(values: ProfileFormValues) {
    try {
      await updateProfile({
        name: values.name,
        email: values.email || undefined,
        phone: values.phone || undefined,
      });
      await mutate();
      success("내 정보가 수정되었습니다.");
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "정보 수정에 실패했습니다.",
      );
    }
  }

  if (!user) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        <div>
          <span className="text-gray-500">로그인 ID</span>
          <p className="mt-1 font-medium">{user.login_id}</p>
        </div>
        <div>
          <span className="text-gray-500">계정 유형</span>
          <p className="mt-1 font-medium">{user.user_type}</p>
        </div>
        <div>
          <span className="text-gray-500">계정 상태</span>
          <p className="mt-1 font-medium">{user.status}</p>
        </div>
        <div>
          <span className="text-gray-500">최종 로그인</span>
          <p className="mt-1 font-medium">
            {user.last_login_at
              ? new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(user.last_login_at))
              : "—"}
          </p>
        </div>
      </div>

      <Input
        label="이름 *"
        {...register("name")}
        error={errors.name?.message}
        placeholder="홍길동"
      />

      <Input
        label="이메일"
        type="email"
        {...register("email")}
        error={errors.email?.message}
        placeholder="example@company.com"
      />

      <Input
        label="전화번호"
        type="tel"
        {...register("phone")}
        error={errors.phone?.message}
        placeholder="010-0000-0000"
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || updateLoading}>
          {isSubmitting || updateLoading ? "저장 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
}
