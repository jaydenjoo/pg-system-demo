"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAgents } from "@/hooks/use-agents";
import type {
  Merchant,
  CreateMerchantForm,
  UpdateMerchantForm,
} from "@/types/merchant";

const createSchema = z.object({
  companyId: z.string().uuid("올바른 UUID를 입력해주세요"),
  agentId: z.string().uuid("대리점을 선택해주세요"),
  merchantCode: z
    .string()
    .min(1, "가맹점 코드를 입력해주세요")
    .max(20, "최대 20자까지 입력 가능합니다")
    .regex(/^[A-Z0-9]+$/, "대문자 영문 및 숫자만 허용됩니다"),
  merchantName: z
    .string()
    .min(1, "가맹점명을 입력해주세요")
    .max(100, "최대 100자까지 입력 가능합니다"),
  settlementCycle: z
    .enum(["D+1", "D+2", "D+3", "WEEKLY", "MONTHLY"])
    .optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  bankName: z.string().max(50).optional(),
  bankAccount: z.string().max(30).optional(),
  bankHolder: z.string().max(50).optional(),
});

/** Backend UpdateMerchantDto: merchantName, status, settlementCycle, bank fields (NO contract dates) */
const updateSchema = z.object({
  merchantName: z.string().max(100).optional(),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "TERMINATED"]).optional(),
  settlementCycle: z
    .enum(["D+1", "D+2", "D+3", "WEEKLY", "MONTHLY"])
    .optional(),
  bankName: z.string().max(50).optional(),
  bankAccount: z.string().max(30).optional(),
  bankHolder: z.string().max(50).optional(),
});

const SETTLEMENT_CYCLE_OPTIONS = [
  { value: "D+1", label: "D+1 정산" },
  { value: "D+2", label: "D+2 정산" },
  { value: "D+3", label: "D+3 정산" },
  { value: "WEEKLY", label: "주정산" },
  { value: "MONTHLY", label: "월정산" },
];

interface MerchantFormProps {
  mode: "create" | "edit";
  merchant?: Merchant;
  onSubmit: (data: CreateMerchantForm | UpdateMerchantForm) => Promise<void>;
  isLoading?: boolean;
  onCancel: () => void;
}

export function MerchantForm({
  mode,
  merchant,
  onSubmit,
  isLoading,
  onCancel,
}: MerchantFormProps) {
  const { agents } = useAgents({ limit: 100 });

  const agentOptions = agents.map((a) => ({
    value: a.id,
    label: `[${a.agent_code}] ${a.agent_name}`,
  }));

  const schema = mode === "create" ? createSchema : updateSchema;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues:
      mode === "edit" && merchant !== undefined
        ? {
            merchantName: merchant.merchant_name,
            settlementCycle: merchant.settlement_cycle ?? undefined,
            bankName: merchant.bank_name ?? undefined,
            bankAccount: merchant.bank_account ?? undefined,
            bankHolder: merchant.bank_holder ?? undefined,
          }
        : {
            companyId: "",
            agentId: "",
            merchantCode: "",
            merchantName: "",
          },
  });

  const selectedAgentId = watch("agentId" as never) as unknown as
    | string
    | undefined;
  const selectedCycle = watch("settlementCycle" as never) as unknown as
    | string
    | undefined;

  const e = errors as Record<string, { message?: string }>;
  const fe = (f: string): { error: string } | Record<never, never> => {
    const msg = e[f]?.message;
    return msg !== undefined ? { error: msg } : {};
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit((data) =>
          onSubmit(data as CreateMerchantForm | UpdateMerchantForm),
        )(e);
      }}
      className="space-y-6"
    >
      {mode === "create" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="회사 ID (UUID)"
              {...register("companyId" as never)}
              {...fe("companyId")}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                소속 대리점 <span className="text-red-500">*</span>
              </label>
              <Select
                options={agentOptions}
                value={selectedAgentId ?? ""}
                onChange={(v) => setValue("agentId" as never, v as never)}
                placeholder="대리점 선택"
              />
              {e.agentId?.message !== undefined && (
                <p className="mt-1 text-xs text-red-600">{e.agentId.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="가맹점 코드"
              {...register("merchantCode" as never)}
              {...fe("merchantCode")}
              placeholder="예: MERCH001"
              className="uppercase"
            />
            <Input
              label="가맹점명"
              {...register("merchantName" as never)}
              {...fe("merchantName")}
              placeholder="가맹점 이름 입력"
            />
          </div>
        </>
      )}

      {mode === "edit" && (
        <Input
          label="가맹점명"
          {...register("merchantName" as never)}
          {...fe("merchantName")}
          placeholder="가맹점 이름 입력"
        />
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          정산 주기
        </label>
        <Select
          options={SETTLEMENT_CYCLE_OPTIONS}
          value={selectedCycle ?? ""}
          onChange={(v) => setValue("settlementCycle" as never, v as never)}
          placeholder="정산 주기 선택"
        />
      </div>

      {mode === "create" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="계약 시작일"
            type="date"
            {...register("contractStartDate" as never)}
          />
          <Input
            label="계약 종료일"
            type="date"
            {...register("contractEndDate" as never)}
          />
        </div>
      )}

      <fieldset className="rounded-lg border border-gray-200 p-4">
        <legend className="px-2 text-sm font-medium text-gray-700">
          은행 정보
        </legend>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="은행명"
            {...register("bankName" as never)}
            placeholder="예: 국민은행"
          />
          <Input
            label="계좌번호"
            {...register("bankAccount" as never)}
            placeholder="계좌번호 입력"
          />
          <Input
            label="예금주"
            {...register("bankHolder" as never)}
            placeholder="예금주명 입력"
          />
        </div>
      </fieldset>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? "처리 중..."
            : mode === "create"
              ? "가맹점 등록"
              : "저장"}
        </Button>
      </div>
    </form>
  );
}
