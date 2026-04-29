"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useReconcile } from "@/hooks/use-deposits";
import type { Deposit } from "@/types/deposit";

interface Props {
  deposit: Deposit;
  onSuccess: () => void;
}

export function ReconcileButton({ deposit, onSuccess }: Props) {
  const { reconcile, isLoading } = useReconcile(deposit.id);
  const [result, setResult] = useState<string | null>(null);

  const handleReconcile = async () => {
    setResult(null);
    try {
      const updated = await reconcile();
      const matched = updated.matched_amount;
      const unmatched = updated.unmatched_amount;
      setResult(
        `대사 완료 — 매칭: ${matched.toLocaleString()}원 / 미매칭: ${unmatched.toLocaleString()}원`,
      );
      onSuccess();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "대사 실패");
    }
  };

  const canReconcile = deposit.reconcile_status !== "MATCHED";

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleReconcile}
        disabled={isLoading || !canReconcile}
        variant={canReconcile ? "default" : "outline"}
        size="sm"
      >
        {isLoading ? "대사 중..." : "자동 대사 실행"}
      </Button>
      {result !== null && (
        <p className="text-xs text-gray-600 rounded bg-gray-50 px-3 py-2 border border-gray-200">
          {result}
        </p>
      )}
    </div>
  );
}
