"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useManualMatch } from "@/hooks/use-deposits";
import type { ManualMatchForm } from "@/types/deposit";

interface Props {
  depositId: string;
  maxAmount: number;
  onSuccess: () => void;
  onClose: () => void;
}

export function ManualMatchDialog({
  depositId,
  maxAmount,
  onSuccess,
  onClose,
}: Props) {
  const { manualMatch, isLoading } = useManualMatch(depositId);
  const [form, setForm] = useState<ManualMatchForm>({
    transactionId: "",
    matchedAmount: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.transactionId.trim()) {
      setError("거래 ID를 입력해주세요.");
      return;
    }
    if (form.matchedAmount <= 0) {
      setError("매칭금액은 1원 이상이어야 합니다.");
      return;
    }
    if (form.matchedAmount > maxAmount) {
      setError(
        `미매칭금액(${maxAmount.toLocaleString()}원)을 초과할 수 없습니다.`,
      );
      return;
    }

    try {
      await manualMatch(form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "수동 매칭에 실패했습니다.",
      );
    }
  };

  return (
    <Dialog open={true} onClose={onClose} title="수동 매칭">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            거래 ID <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="거래 UUID 입력"
            value={form.transactionId}
            onChange={(e) =>
              setForm((f) => ({ ...f, transactionId: e.target.value }))
            }
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            매칭금액 <span className="text-red-500">*</span>
            <span className="ml-2 text-xs text-gray-400">
              (최대 {maxAmount.toLocaleString()}원)
            </span>
          </label>
          <Input
            type="number"
            min={1}
            max={maxAmount}
            placeholder="0"
            value={form.matchedAmount === 0 ? "" : form.matchedAmount}
            onChange={(e) =>
              setForm((f) => ({ ...f, matchedAmount: Number(e.target.value) }))
            }
            required
          />
        </div>

        {error !== null && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isLoading} className="flex-1">
            {isLoading ? "처리 중..." : "매칭 확정"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            취소
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
