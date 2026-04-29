"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAgents } from "@/hooks/use-agents";
import { AgentTable } from "@/components/agents/AgentTable";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import type { AgentQuery } from "@/types/agent";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "활성" },
  { value: "SUSPENDED", label: "정지" },
  { value: "TERMINATED", label: "해지" },
];

export default function AgentsPage() {
  const router = useRouter();
  const [query, setQuery] = useState<AgentQuery>({
    page: 1,
    limit: 20,
    search: "",
    status: "",
  });

  const { agents, meta, isLoading, mutate } = useAgents(query);

  const updateQuery = (updates: Partial<AgentQuery>) => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = () => {
    setQuery({ page: 1, limit: 20, search: "", status: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대리점 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}개
          </p>
        </div>
        <Button onClick={() => router.push("/agents/new")}>
          + 대리점 추가
        </Button>
      </div>

      <FilterBar
        searchValue={query.search ?? ""}
        onSearchChange={(v) => updateQuery({ search: v })}
        searchPlaceholder="대리점 코드 또는 이름 검색..."
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

      <AgentTable
        agents={agents}
        isLoading={isLoading}
        onRefresh={() => void mutate()}
      />

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />
    </div>
  );
}
