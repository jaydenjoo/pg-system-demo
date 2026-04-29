"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAgents } from "@/hooks/use-agents";
import type { Agent, CreateAgentForm, UpdateAgentForm } from "@/types/agent";

const createSchema = z.object({
  companyId: z.string().uuid("올바른 UUID를 입력해주세요"),
  agentCode: z
    .string()
    .min(1, "대리점 코드를 입력해주세요")
    .max(20, "최대 20자까지 입력 가능합니다")
    .regex(/^[A-Z0-9]+$/, "대문자 영문 및 숫자만 허용됩니다"),
  agentName: z
    .string()
    .min(1, "대리점명을 입력해주세요")
    .max(100, "최대 100자까지 입력 가능합니다"),
  parentAgentId: z.string().uuid().optional().or(z.literal("")),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  bankName: z.string().max(50).optional(),
  bankAccount: z.string().max(30).optional(),
  bankHolder: z.string().max(50).optional(),
});

/** Backend UpdateAgentDto only accepts agentName and status */
const updateSchema = z.object({
  agentName: z.string().max(100).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "TERMINATED"]).optional(),
});

interface AgentFormProps {
  mode: "create" | "edit";
  agent?: Agent;
  onSubmit: (data: CreateAgentForm | UpdateAgentForm) => Promise<void>;
  isLoading?: boolean;
  onCancel: () => void;
}

export function AgentForm({
  mode,
  agent,
  onSubmit,
  isLoading,
  onCancel,
}: AgentFormProps) {
  const { agents } = useAgents({ limit: 100 });

  const parentAgentOptions = [
    { value: "", label: "없음 (최상위 대리점)" },
    ...agents
      .filter((a) => agent === undefined || a.id !== agent.id)
      .map((a) => ({
        value: a.id,
        label: `[${a.agent_code}] ${a.agent_name}`,
      })),
  ];

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
      mode === "edit" && agent !== undefined
        ? {
            agentName: agent.agent_name,
          }
        : {
            companyId: "",
            agentCode: "",
            agentName: "",
            parentAgentId: "",
          },
  });

  const selectedParentId = watch("parentAgentId" as never) as unknown as
    | string
    | undefined;

  const e = errors as Record<string, { message?: string }>;
  const fe = (f: string): { error: string } | Record<never, never> => {
    const msg = e[f]?.message;
    return msg !== undefined ? { error: msg } : {};
  };

  const handleFormSubmit = (data: Record<string, unknown>) => {
    const cleaned = { ...data };
    if (cleaned.parentAgentId === "") {
      delete cleaned.parentAgentId;
    }
    return onSubmit(cleaned as CreateAgentForm | UpdateAgentForm);
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit((data) =>
          handleFormSubmit(data as Record<string, unknown>),
        )(e);
      }}
      className="space-y-6"
    >
      {mode === "create" && (
        <>
          <Input
            label="회사 ID (UUID)"
            {...register("companyId" as never)}
            {...fe("companyId")}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="대리점 코드"
              {...register("agentCode" as never)}
              {...fe("agentCode")}
              placeholder="예: AGENT001"
              className="uppercase"
            />
            <Input
              label="대리점명"
              {...register("agentName" as never)}
              {...fe("agentName")}
              placeholder="대리점 이름 입력"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              상위 대리점
            </label>
            <Select
              options={parentAgentOptions}
              value={selectedParentId ?? ""}
              onChange={(v) => setValue("parentAgentId" as never, v as never)}
              placeholder="상위 대리점 선택 (없으면 최상위)"
            />
          </div>
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
        </>
      )}

      {mode === "edit" && (
        <Input
          label="대리점명"
          {...register("agentName" as never)}
          {...fe("agentName")}
          placeholder="대리점 이름 입력"
        />
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? "처리 중..."
            : mode === "create"
              ? "대리점 등록"
              : "저장"}
        </Button>
      </div>
    </form>
  );
}
