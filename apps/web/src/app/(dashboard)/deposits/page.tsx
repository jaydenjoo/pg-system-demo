"use client";

import { useState } from "react";
import { useDeposits, useCreateDeposit } from "@/hooks/use-deposits";
import { DepositTable } from "@/components/deposits/DepositTable";
import { DepositForm } from "@/components/deposits/DepositForm";
import { Dialog } from "@/components/ui/dialog";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type {
  DepositQuery,
  CreateDepositForm,
  ReconcileStatus,
} from "@/types/deposit";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "대기" },
  { value: "MATCHED", label: "매칭완료" },
  { value: "MISMATCHED", label: "불일치" },
  { value: "MANUAL", label: "수동처리" },
];

export default function DepositsPage() {
  const [query, setQuery] = useState<DepositQuery>({ page: 1, limit: 20 });
  const [showForm, setShowForm] = useState(false);

  const { deposits, meta, isLoading, mutate } = useDeposits(query);
  const { createDeposit, isLoading: isCreating } = useCreateDeposit();
  const { success, error } = useToast();

  const updateQuery = (updates: Partial<DepositQuery>) => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = () => {
    setQuery({ page: 1, limit: 20 });
  };

  const handleCreate = async (form: CreateDepositForm) => {
    try {
      await createDeposit(form);
      success("입금이 등록되었습니다.");
      await mutate();
      setShowForm(false);
    } catch (err) {
      error(err instanceof Error ? err.message : "입금 등록에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">입금 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}건
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>+ 입금 등록</Button>
      </div>

      <FilterBar
        searchValue=""
        onSearchChange={() => undefined}
        searchPlaceholder="입금출처 검색..."
        filters={[
          {
            key: "reconcileStatus",
            label: "대사상태",
            options: STATUS_OPTIONS,
            value: query.reconcileStatus ?? "",
            onChange: (v) =>
              v
                ? updateQuery({ reconcileStatus: v as ReconcileStatus })
                : setQuery((prev) => {
                    const { reconcileStatus: _r, ...rest } = prev;
                    return { ...rest, page: 1 };
                  }),
          },
        ]}
        onReset={handleReset}
      />

      <DepositTable deposits={deposits} isLoading={isLoading} />

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title="입금 등록"
      >
        <DepositForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          isLoading={isCreating}
        />
      </Dialog>
    </div>
  );
}
