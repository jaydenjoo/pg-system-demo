"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { useSettlements } from "@/hooks/use-settlements";
import { SettlementTable } from "@/components/settlements/SettlementTable";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import type { SettlementQuery } from "@/types/settlement";

const STATUS_OPTIONS = [
  { value: "CALCULATED", label: "산출" },
  { value: "CONFIRMED", label: "확정" },
  { value: "REMITTED", label: "송금" },
  { value: "COMPLETED", label: "완료" },
];

export default function MerchantSettlementsPage(): React.JSX.Element {
  const [query, setQuery] = useState<SettlementQuery>({ page: 1, limit: 20 });
  const { settlements, meta, isLoading, mutate } = useSettlements(query);

  const updateQuery = (updates: Partial<SettlementQuery>): void => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = (): void => {
    setQuery({ page: 1, limit: 20 });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">정산 내역</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}건
          </p>
        </div>
      </div>

      <FilterBar
        searchValue=""
        onSearchChange={() => undefined}
        searchPlaceholder="정산 검색..."
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
        hideMerchantColumn
        detailBasePath="/m/settlements"
      />

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />
    </div>
  );
}
