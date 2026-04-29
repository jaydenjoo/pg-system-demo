"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMerchants } from "@/hooks/use-merchants";
import { MerchantTable } from "@/components/merchants/MerchantTable";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import type { MerchantQuery } from "@/types/merchant";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "심사중" },
  { value: "ACTIVE", label: "활성" },
  { value: "SUSPENDED", label: "정지" },
  { value: "TERMINATED", label: "해지" },
];

export default function MerchantsPage() {
  const router = useRouter();
  const [query, setQuery] = useState<MerchantQuery>({
    page: 1,
    limit: 20,
    search: "",
    status: "",
  });

  const { merchants, meta, isLoading, mutate } = useMerchants(query);

  const updateQuery = (updates: Partial<MerchantQuery>) => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = () => {
    setQuery({ page: 1, limit: 20, search: "", status: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">가맹점 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}개
          </p>
        </div>
        <Button onClick={() => router.push("/merchants/new")}>
          + 가맹점 추가
        </Button>
      </div>

      <FilterBar
        searchValue={query.search ?? ""}
        onSearchChange={(v) => updateQuery({ search: v })}
        searchPlaceholder="가맹점 코드 또는 이름 검색..."
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

      <MerchantTable
        merchants={merchants}
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
