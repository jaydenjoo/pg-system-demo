"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import { useMerchants } from "@/hooks/use-merchants";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateOnly } from "@/lib/format";
import type { MerchantQuery } from "@/types/merchant";
import type { MerchantStatus } from "@/types/merchant";

const STATUS_LABELS: Record<MerchantStatus, string> = {
  PENDING: "대기",
  ACTIVE: "활성",
  SUSPENDED: "정지",
  TERMINATED: "해지",
};

const STATUS_VARIANTS: Record<MerchantStatus, "default" | "success" | "warning" | "danger"> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  TERMINATED: "default",
};

const STATUS_OPTIONS = [
  { value: "PENDING", label: "대기" },
  { value: "ACTIVE", label: "활성" },
  { value: "SUSPENDED", label: "정지" },
  { value: "TERMINATED", label: "해지" },
];

export default function AgentMerchantsPage(): React.JSX.Element {
  const [query, setQuery] = useState<MerchantQuery>({ page: 1, limit: 20 });
  const { merchants, meta, isLoading } = useMerchants(query);

  const updateQuery = (updates: Partial<MerchantQuery>): void => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = (): void => {
    setQuery({ page: 1, limit: 20 });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Store className="h-6 w-6 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">관리 가맹점</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}개 가맹점
          </p>
        </div>
      </div>

      <FilterBar
        searchValue={query.search ?? ""}
        onSearchChange={(v) => updateQuery({ search: v })}
        searchPlaceholder="가맹점명 또는 코드 검색..."
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : merchants.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-gray-400">
          소속 가맹점이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">가맹점코드</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">가맹점명</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">정산주기</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">상태</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">계약시작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {merchants.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">
                    {m.merchant_code}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{m.merchant_name}</td>
                  <td className="px-4 py-3 text-gray-600">{m.settlement_cycle}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[m.status]}>
                      {STATUS_LABELS[m.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatDateOnly(m.contract_start_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />
    </div>
  );
}
