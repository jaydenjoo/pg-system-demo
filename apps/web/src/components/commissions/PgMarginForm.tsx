"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetPgMargin } from "@/hooks/use-commissions";
import type { SetPgMarginForm } from "@/types/commission";

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function PgMarginForm({ onSuccess, onCancel }: Props) {
  const { setPgMargin, isLoading } = useSetPgMargin();
  const [form, setForm] = useState({
    paymentMethod: "",
    cardCompany: "",
    marginRate: "",
    minFee: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.paymentMethod.trim()) {
      setError("결제수단을 입력해주세요.");
      return;
    }

    const rate = Number(form.marginRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      setError("수수료율은 0~100 사이여야 합니다.");
      return;
    }

    try {
      const payload: SetPgMarginForm = {
        paymentMethod: form.paymentMethod.trim(),
        marginRate: form.marginRate,
        ...(form.cardCompany.trim()
          ? { cardCompany: form.cardCompany.trim() }
          : {}),
        ...(form.minFee > 0 ? { minFee: form.minFee } : {}),
      };
      await setPgMargin(payload);
      onSuccess();
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
          value={form.marginRate}
          onChange={(e) =>
            setForm((f) => ({ ...f, marginRate: e.target.value }))
          }
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          최소수수료 (원)
        </label>
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={form.minFee === 0 ? "" : form.minFee}
          onChange={(e) =>
            setForm((f) => ({ ...f, minFee: Number(e.target.value) }))
          }
        />
      </div>

      {error !== null && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "저장 중..." : "PG 마진 저장"}
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
