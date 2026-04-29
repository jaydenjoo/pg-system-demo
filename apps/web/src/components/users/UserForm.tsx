"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { CreateUserForm, UpdateUserForm } from "@/types/user";

const createSchema = z.object({
  loginId: z
    .string()
    .min(4, "아이디는 4자 이상이어야 합니다")
    .max(50, "아이디는 50자 이하이어야 합니다")
    .regex(
      /^[a-zA-Z0-9._@-]+$/,
      "영문/숫자/밑줄/점/골뱅이/하이픈 사용 가능합니다",
    ),
  password: z
    .string()
    .min(12, "비밀번호는 12자 이상이어야 합니다 (PCI DSS 8.3.6)")
    .regex(
      /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
      "비밀번호는 영문, 숫자, 특수문자를 포함해야 합니다",
    ),
  name: z.string().min(1, "이름을 입력해주세요").max(50),
  email: z
    .string()
    .email("올바른 이메일 형식이 아닙니다")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .regex(/^010-\d{4}-\d{4}$/, "전화번호 형식: 010-0000-0000")
    .optional()
    .or(z.literal("")),
  userType: z.enum(["ADMIN", "AGENT", "MERCHANT"]),
  roleIds: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요").max(50),
  email: z
    .string()
    .email("올바른 이메일 형식이 아닙니다")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .regex(/^010-\d{4}-\d{4}$/, "전화번호 형식: 010-0000-0000")
    .optional()
    .or(z.literal("")),
  status: z.enum(["ACTIVE", "LOCKED", "DORMANT", "WITHDRAWN"]),
});

type Mode = "create" | "update";

interface UserFormProps {
  mode: Mode;
  defaultValues?: Partial<CreateUserForm & UpdateUserForm> | undefined;
  onSubmit: (data: CreateUserForm | UpdateUserForm) => Promise<void>;
  isLoading?: boolean | undefined;
}

const USER_TYPE_OPTIONS = [
  { value: "ADMIN", label: "관리자" },
  { value: "AGENT", label: "대리점" },
  { value: "MERCHANT", label: "가맹점" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "활성" },
  { value: "LOCKED", label: "잠금" },
  { value: "DORMANT", label: "휴면" },
  { value: "WITHDRAWN", label: "탈퇴" },
];

export function UserForm({
  mode,
  defaultValues,
  onSubmit,
  isLoading,
}: UserFormProps) {
  const schema = mode === "create" ? createSchema : updateSchema;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    ...(defaultValues !== undefined && { defaultValues }),
  });

  const fieldClass =
    "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const errorClass = "mt-1 text-xs text-red-600";

  return (
    <form
      onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])}
      className="space-y-4"
    >
      {mode === "create" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              아이디 *
            </label>
            <input
              {...register("loginId")}
              className={fieldClass}
              placeholder="영문/숫자/밑줄/점/골뱅이/하이픈"
            />
            {"loginId" in errors && errors.loginId !== undefined && (
              <p className={errorClass}>{errors.loginId.message as string}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              비밀번호 * (12자 이상, 영문+숫자+특수문자)
            </label>
            <input
              type="password"
              {...register("password")}
              className={fieldClass}
              autoComplete="new-password"
            />
            {"password" in errors && errors.password !== undefined && (
              <p className={errorClass}>{errors.password.message as string}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              유형 *
            </label>
            <select {...register("userType")} className={fieldClass}>
              {USER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          이름 *
        </label>
        <input {...register("name")} className={fieldClass} />
        {errors.name !== undefined && (
          <p className={errorClass}>{errors.name.message as string}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          이메일
        </label>
        <input type="email" {...register("email")} className={fieldClass} />
        {errors.email !== undefined && (
          <p className={errorClass}>{errors.email.message as string}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          전화번호
        </label>
        <input
          {...register("phone")}
          className={fieldClass}
          placeholder="010-0000-0000"
        />
        {errors.phone !== undefined && (
          <p className={errorClass}>{errors.phone.message as string}</p>
        )}
      </div>

      {mode === "update" && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            상태 *
          </label>
          <select {...register("status")} className={fieldClass}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {"status" in errors && errors.status !== undefined && (
            <p className={errorClass}>{errors.status.message as string}</p>
          )}
        </div>
      )}

      <div className="pt-2">
        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading
            ? "저장 중..."
            : mode === "create"
              ? "사용자 생성"
              : "변경 저장"}
        </Button>
      </div>
    </form>
  );
}
