"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { CreateRoleForm, UpdateRoleForm } from "@/types/user";

const createRoleSchema = z.object({
  name: z
    .string()
    .min(1, "역할명을 입력해주세요")
    .max(50, "역할명은 50자 이하이어야 합니다"),
  description: z.string().max(200, "설명은 200자 이하이어야 합니다"),
  userType: z.enum(["ADMIN", "AGENT", "MERCHANT"]),
});

const updateRoleSchema = z.object({
  name: z
    .string()
    .min(1, "역할명을 입력해주세요")
    .max(50, "역할명은 50자 이하이어야 합니다"),
  description: z.string().max(200, "설명은 200자 이하이어야 합니다"),
});

const USER_TYPE_OPTIONS = [
  { value: "ADMIN", label: "관리자" },
  { value: "AGENT", label: "대리점" },
  { value: "MERCHANT", label: "가맹점" },
];

interface RoleFormProps {
  defaultValues?: Partial<CreateRoleForm & UpdateRoleForm> | undefined;
  onSubmit: (data: CreateRoleForm | UpdateRoleForm) => Promise<void>;
  isLoading?: boolean | undefined;
  mode: "create" | "update";
}

export function RoleForm({
  defaultValues,
  onSubmit,
  isLoading,
  mode,
}: RoleFormProps) {
  const schema = mode === "create" ? createRoleSchema : updateRoleSchema;

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

  return (
    <form
      onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700">
          역할명 *
        </label>
        <input {...register("name")} className={fieldClass} />
        {errors.name !== undefined && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">설명</label>
        <textarea
          {...register("description")}
          className={fieldClass}
          rows={3}
          placeholder="역할에 대한 설명을 입력하세요"
        />
        {errors.description !== undefined && (
          <p className="mt-1 text-xs text-red-600">
            {errors.description.message}
          </p>
        )}
      </div>

      {mode === "create" && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            적용 유형 *
          </label>
          <select {...register("userType")} className={fieldClass}>
            {USER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {"userType" in errors && errors.userType !== undefined && (
            <p className="mt-1 text-xs text-red-600">
              {(errors.userType as { message?: string }).message}
            </p>
          )}
        </div>
      )}

      <div className="pt-2">
        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading
            ? "저장 중..."
            : mode === "create"
              ? "역할 생성"
              : "변경 저장"}
        </Button>
      </div>
    </form>
  );
}
