"use client";

import { useRouter, useParams } from "next/navigation";
import {
  useSettlement,
  useConfirmSettlement,
  useCompleteSettlement,
} from "@/hooks/use-settlements";
import { SettlementDetail } from "@/components/settlements/SettlementDetail";
import { SettlementActions } from "@/components/settlements/SettlementActions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function SettlementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const settlementId = params.id;

  const { settlement, isLoading, mutate } = useSettlement(settlementId);
  const { confirmSettlement, isLoading: isConfirming } = useConfirmSettlement(settlementId);
  const { completeSettlement, isLoading: isCompleting } = useCompleteSettlement(settlementId);
  const { success, error } = useToast();

  const handleConfirm = async () => {
    try {
      await confirmSettlement();
      success("정산이 확정되었습니다.");
      await mutate();
    } catch (err) {
      error(err instanceof Error ? err.message : "확정에 실패했습니다.");
    }
  };

  const handleComplete = async () => {
    try {
      await completeSettlement();
      success("정산이 완료 처리되었습니다.");
      await mutate();
    } catch (err) {
      error(err instanceof Error ? err.message : "완료 처리에 실패했습니다.");
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

  if (settlement === null) {
    return (
      <div className="py-12 text-center text-gray-400">정산을 찾을 수 없습니다.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            ← 뒤로
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">정산 상세</h1>
            <p className="text-sm text-gray-500">
              {settlement.merchants?.merchant_name ?? "-"}
            </p>
          </div>
        </div>
        <SettlementActions
          status={settlement.status}
          onConfirm={handleConfirm}
          onComplete={handleComplete}
          isConfirming={isConfirming}
          isCompleting={isCompleting}
        />
      </div>

      <SettlementDetail settlement={settlement} />
    </div>
  );
}
