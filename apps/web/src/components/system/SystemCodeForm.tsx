"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { SystemCode, CreateSystemCodeForm, UpdateSystemCodeForm } from "@/types/system";

/* ── Zod 스키마 ── */

const createSchema = z.object({
  groupCode: z
    .string()
    .min(1, "그룹코드를 입력해주세요")
    .max(30, "그룹코드는 30자 이하이어야 합니다"),
  code: z
    .string()
    .min(1, "코드를 입력해주세요")
    .max(30, "코드는 30자 이하이어야 합니다"),
  name: z
    .string()
    .min(1, "이름을 입력해주세요")
    .max(100, "이름은 100자 이하이어야 합니다"),
  sortOrder: z.coerce.number().min(0).optional(),
  extraValue1: z.string().max(200).optional().or(z.literal("")),
  extraValue2: z.string().max(200).optional().or(z.literal("")),
});

const updateSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해주세요")
    .max(100, "이름은 100자 이하이어야 합니다"),
  sortOrder: z.coerce.number().min(0).optional(),
  extraValue1: z.string().max(200).optional().or(z.literal("")),
  extraValue2: z.string().max(200).optional().or(z.literal("")),
});

/* ── 컴포넌트 ── */

interface SystemCodeFormProps {
  editTarget: SystemCode | null;
  onSubmitCreate: (form: CreateSystemCodeForm) => void;
  onSubmitUpdate: (id: string, form: UpdateSystemCodeForm) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function SystemCodeForm({
  editTarget,
  onSubmitCreate,
  onSubmitUpdate,
  onCancel,
  isLoading,
}: SystemCodeFormProps) {
  const isEdit = editTarget !== null;
  const schema = isEdit ? updateSchema : createSchema;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit
      ? {
          name: editTarget.name,
          sortOrder: editTarget.sort_order,
          extraValue1: editTarget.extra_value1 ?? "",
          extraValue2: editTarget.extra_value2 ?? "",
        }
      : {
          groupCode: "",
          code: "",
          name: "",
          sortOrder: 0,
          extraValue1: "",
          extraValue2: "",
        },
  });

  const fieldClass =
    "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const errorClass = "mt-1 text-xs text-red-600";

  const onValid = (data: Record<string, unknown>): void => {
    if (isEdit && editTarget !== null) {
      const form: UpdateSystemCodeForm = {
        name: (data.name as string) || undefined,
        sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : undefined,
        extraValue1: (data.extraValue1 as string) || undefined,
        extraValue2: (data.extraValue2 as string) || undefined,
      };
      onSubmitUpdate(editTarget.id, form);
    } else {
      const form: CreateSystemCodeForm = {
        groupCode: data.groupCode as string,
        code: data.code as string,
        name: data.name as string,
        sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : undefined,
        extraValue1: (data.extraValue1 as string) || undefined,
        extraValue2: (data.extraValue2 as string) || undefined,
      };
      onSubmitCreate(form);
    }
  };

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-4">
      {!isEdit && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              그룹코드 *
            </label>
            <input
              {...register("groupCode")}
              className={fieldClass}
              placeholder="예: PAYMENT_METHOD"
            />
            {"groupCode" in errors && errors.groupCode !== undefined && (
              <p className={errorClass}>
                {errors.groupCode.message as string}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              코드 *
            </label>
            <input
              {...register("code")}
              className={fieldClass}
              placeholder="예: CARD"
            />
            {"code" in errors && errors.code !== undefined && (
              <p className={errorClass}>{errors.code.message as string}</p>
            )}
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          이름 *
        </label>
        <input
          {...register("name")}
          className={fieldClass}
          placeholder="예: 신용카드"
        />
        {errors.name !== undefined && (
          <p className={errorClass}>{errors.name.message as string}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          정렬순서
        </label>
        <input
          type="number"
          {...register("sortOrder")}
          className={fieldClass}
          min={0}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          부가값1
        </label>
        <input {...register("extraValue1")} className={fieldClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          부가값2
        </label>
        <input {...register("extraValue2")} className={fieldClass} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          취소
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "저장 중..." : isEdit ? "수정" : "추가"}
        </Button>
      </div>
    </form>
  );
}
