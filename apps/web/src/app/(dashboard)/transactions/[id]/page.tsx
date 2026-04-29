"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTransaction, useCancelTransaction } from "@/hooks/use-transactions";
import { TransactionDetail } from "@/components/transactions/TransactionDetail";
import { CancelTransactionDialog } from "@/components/transactions/CancelTransactionDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { CancelTransactionForm } from "@/types/transaction";

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const txId = params.id;

  const { transaction, isLoading, mutate } = useTransaction(txId);
  const { cancelTransaction, isLoading: isCancelling } =
    useCancelTransaction(txId);
  const { success, error } = useToast();
  const [showCancel, setShowCancel] = useState(false);

  const handleCancel = async (form: CancelTransactionForm) => {
    try {
      await cancelTransaction(form);
      success("거래가 취소되었습니다.");
      await mutate();
      setShowCancel(false);
    } catch (err) {
      error(err instanceof Error ? err.message : "거래 취소에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (transaction === null) {
    return (
      <div className="py-12 text-center text-gray-400">
        거래를 찾을 수 없습니다.
      </div>
    );
  }

  const canCancel = transaction.status === "APPROVED";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            ← 뒤로
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">거래 상세</h1>
            <p className="font-mono text-sm text-gray-500">
              {transaction.tran_no}
            </p>
          </div>
        </div>
        {canCancel && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowCancel(true)}
          >
            거래 취소
          </Button>
        )}
      </div>

      <TransactionDetail transaction={transaction} />

      <CancelTransactionDialog
        isOpen={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        isLoading={isCancelling}
      />
    </div>
  );
}
