"use client";

import { Button } from "@/components/ui/button";
import type { SettlementStatus } from "@/types/settlement";

interface Props {
  status: SettlementStatus;
  onConfirm: () => Promise<void>;
  onComplete: () => Promise<void>;
  isConfirming: boolean;
  isCompleting: boolean;
}

export function SettlementActions({
  status,
  onConfirm,
  onComplete,
  isConfirming,
  isCompleting,
}: Props) {
  if (status === "REMITTED" || status === "COMPLETED") {
    return (
      <div className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-500">
        {status === "COMPLETED" ? "정산 완료" : "송금 완료"}
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {status === "CALCULATED" && (
        <Button
          onClick={() => void onConfirm()}
          disabled={isConfirming}
          size="sm"
        >
          {isConfirming ? "처리중..." : "확정"}
        </Button>
      )}
      {status === "CONFIRMED" && (
        <Button
          onClick={() => void onComplete()}
          disabled={isCompleting}
          size="sm"
        >
          {isCompleting ? "처리중..." : "송금 처리"}
        </Button>
      )}
    </div>
  );
}
