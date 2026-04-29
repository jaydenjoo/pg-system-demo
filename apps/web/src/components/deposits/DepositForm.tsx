"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CreateDepositForm } from "@/types/deposit";

interface Props {
  onSubmit: (form: CreateDepositForm) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function DepositForm({ onSubmit, onCancel, isLoading }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<CreateDepositForm>({
    depositDate: today,
    source: "",
    amount: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.source.trim()) {
      setError("입금출처를 입력해주세요.");
      return;
    }
    if (form.amount <= 0) {
      setError("입금금액은 1원 이상이어야 합니다.");
      return;
    }

    try {
      await onSubmit({
        depositDate: form.depositDate,
        source: form.source.trim(),
        amount: form.amount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          입금일 <span className="text-red-500">*</span>
        </label>
        <Input
          type="date"
          value={form.depositDate}
          onChange={(e) =>
            setForm((f) => ({ ...f, depositDate: e.target.value }))
          }
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          입금출처 <span className="text-red-500">*</span>
        </label>
        <Input
          placeholder="입금출처명"
          value={form.source}
          onChange={(e) =>
            setForm((f) => ({ ...f, source: e.target.value }))
          }
          maxLength={100}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          입금금액 <span className="text-red-500">*</span>
        </label>
        <Input
          type="number"
          placeholder="0"
          min={1}
          value={form.amount === 0 ? "" : form.amount}
          onChange={(e) =>
            setForm((f) => ({ ...f, amount: Number(e.target.value) }))
          }
          required
        />
      </div>

      {error !== null && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "등록 중..." : "입금 등록"}
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
