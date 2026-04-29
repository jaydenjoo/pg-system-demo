"use client";

import { useState } from "react";
import {
  useSettlements,
  useCalculateSettlement,
} from "@/hooks/use-settlements";
import { SettlementTable } from "@/components/settlements/SettlementTable";
import { CalculateDialog } from "@/components/settlements/CalculateDialog";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { SettlementQuery } from "@/types/settlement";
import type { CalculateSettlementForm } from "@/types/settlement";

const STATUS_OPTIONS = [
  { value: "CALCULATED", label: "산출" },
  { value: "CONFIRMED", label: "확정" },
  { value: "REMITTED", label: "송금" },
  { value: "COMPLETED", label: "완료" },
];

export default function SettlementsPage() {
  const [query, setQuery] = useState<SettlementQuery>({ page: 1, limit: 20 });
  const [showCalculate, setShowCalculate] = useState(false);

  const { settlements, meta, isLoading, mutate } = useSettlements(query);
  const { calculateSettlement, isLoading: isCalculating } =
    useCalculateSettlement();
  const { success, error } = useToast();

  const updateQuery = (updates: Partial<SettlementQuery>) => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = () => {
    setQuery({ page: 1, limit: 20 });
  };

  const handleCalculate = async (form: CalculateSettlementForm) => {
    try {
      await calculateSettlement(form);
      success("정산이 계산되었습니다.");
      await mutate();
      setShowCalculate(false);
    } catch (err) {
      error(err instanceof Error ? err.message : "정산 계산에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">정산 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}건
          </p>
        </div>
        <Button onClick={() => setShowCalculate(true)}>+ 정산 계산</Button>
      </div>

      <FilterBar
        searchValue=""
        onSearchChange={() => undefined}
        searchPlaceholder="가맹점 검색..."
        filters={[
          {
            key: "status",
            label: "상태",
            options: STATUS_OPTIONS,
            value: query.status ?? "",
            onChange: (v) => updateQuery({ status: v }),
          },
        ]}
        onReset={handleReset}
      />

      <SettlementTable
        settlements={settlements}
        isLoading={isLoading}
        onRefresh={() => void mutate()}
      />

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />

      <CalculateDialog
        isOpen={showCalculate}
        onClose={() => setShowCalculate(false)}
        onConfirm={handleCalculate}
        isLoading={isCalculating}
      />
    </div>
  );
}
