"use client";

import { useState } from "react";
import { useAgentSettlements } from "@/hooks/use-settlements";
import { AgentSettlementTable } from "@/components/settlements/AgentSettlementTable";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/filter-bar";
import type { AgentSettlementQuery } from "@/types/settlement";

const STATUS_OPTIONS = [
  { value: "CALCULATED", label: "산출" },
  { value: "CONFIRMED", label: "확정" },
  { value: "REMITTED", label: "송금" },
  { value: "COMPLETED", label: "완료" },
];

export default function AgentSettlementsPage() {
  const [query, setQuery] = useState<AgentSettlementQuery>({
    page: 1,
    limit: 20,
  });

  const { settlements, meta, isLoading } = useAgentSettlements(query);

  const handleReset = () => {
    setQuery({ page: 1, limit: 20 });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대리점 정산</h1>
        <p className="mt-1 text-sm text-gray-500">
          총 {meta.total.toLocaleString()}건
        </p>
      </div>

      <FilterBar
        searchValue=""
        onSearchChange={() => undefined}
        searchPlaceholder="대리점 검색..."
        filters={[
          {
            key: "status",
            label: "상태",
            options: STATUS_OPTIONS,
            value: query.status ?? "",
            onChange: (v) =>
              setQuery((prev) => ({ ...prev, status: v, page: 1 })),
          },
        ]}
        onReset={handleReset}
      />

      <AgentSettlementTable settlements={settlements} isLoading={isLoading} />

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />
    </div>
  );
}
