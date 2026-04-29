"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDeposit } from "@/hooks/use-deposits";
import { DepositDetail } from "@/components/deposits/DepositDetail";
import { ReconcileButton } from "@/components/deposits/ReconcileButton";
import { ManualMatchDialog } from "@/components/deposits/ManualMatchDialog";
import { MatchedTransactionList } from "@/components/deposits/MatchedTransactionList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DepositDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const depositId = params.id;

  const { deposit, isLoading, mutate } = useDeposit(depositId);
  const [showMatch, setShowMatch] = useState(false);

  const handleRefresh = async () => {
    await mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (deposit === null) {
    return (
      <div className="py-12 text-center text-gray-400">
        입금을 찾을 수 없습니다.
      </div>
    );
  }

  const matches = deposit.deposit_transactions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            ← 뒤로
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">입금 상세</h1>
            <p className="text-sm text-gray-500">{deposit.source}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <ReconcileButton deposit={deposit} onSuccess={handleRefresh} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMatch(true)}
            disabled={deposit.unmatched_amount <= 0}
          >
            수동 매칭
          </Button>
        </div>
      </div>

      <DepositDetail deposit={deposit} />

      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-800">
          매칭된 거래 ({matches.length}건)
        </h2>
        <MatchedTransactionList
          depositId={depositId}
          matches={matches}
          onRefresh={handleRefresh}
        />
      </div>

      {showMatch && (
        <ManualMatchDialog
          depositId={depositId}
          maxAmount={deposit.unmatched_amount}
          onSuccess={handleRefresh}
          onClose={() => setShowMatch(false)}
        />
      )}
    </div>
  );
}
