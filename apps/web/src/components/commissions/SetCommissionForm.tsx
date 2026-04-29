"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SetAgentCommissionForm } from "@/types/commission";

interface Props {
  entityLabel: string; // "대리점" | "가맹점"
  onSubmit: (form: SetAgentCommissionForm) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function SetCommissionForm({
  entityLabel,
  onSubmit,
  onCancel,
  isLoading,
}: Props) {
  const [form, setForm] = useState({
    paymentMethod: "",
    cardCompany: "",
    commissionRate: "",
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.paymentMethod.trim()) {
      setError("결제수단을 입력해주세요.");
      return;
    }

    const rate = Number(form.commissionRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      setError("수수료율은 0~100 사이여야 합니다.");
      return;
    }

    try {
      const payload: SetAgentCommissionForm = {
        paymentMethod: form.paymentMethod.trim(),
        commissionRate: form.commissionRate,
        ...(form.cardCompany.trim()
          ? { cardCompany: form.cardCompany.trim() }
          : {}),
      };
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "설정에 실패했습니다.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          결제수단 <span className="text-red-500">*</span>
        </label>
        <Input
          placeholder="예: CARD, BANK_TRANSFER"
          value={form.paymentMethod}
          onChange={(e) =>
            setForm((f) => ({ ...f, paymentMethod: e.target.value }))
          }
          maxLength={50}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          카드사
          <span className="ml-2 text-xs text-gray-400">
            (비워두면 공통 적용)
          </span>
        </label>
        <Input
          placeholder="예: 신한카드"
          value={form.cardCompany}
          onChange={(e) =>
            setForm((f) => ({ ...f, cardCompany: e.target.value }))
          }
          maxLength={50}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          수수료율 (%) <span className="text-red-500">*</span>
        </label>
        <Input
          type="number"
          step="0.01"
          min={0}
          max={100}
          placeholder="0.00"
          value={form.commissionRate}
          onChange={(e) =>
            setForm((f) => ({ ...f, commissionRate: e.target.value }))
          }
          required
        />
      </div>

      {error !== null && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "저장 중..." : `${entityLabel} 수수료 저장`}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
        >
          취소
        </Button>
      </div>
    </form>
  );
}
