"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useTransactions } from "@/hooks/use-transactions";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { TransactionFilter } from "@/components/transactions/TransactionFilter";
import { Pagination } from "@/components/ui/pagination";
import type { TransactionQuery } from "@/types/transaction";

export default function MerchantTransactionsPage(): React.JSX.Element {
  const [query, setQuery] = useState<TransactionQuery>({ page: 1, limit: 20 });
  const { transactions, meta, isLoading, mutate } = useTransactions(query);

  const updateQuery = (updates: Partial<TransactionQuery>): void => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = (): void => {
    setQuery({ page: 1, limit: 20 });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-6 w-6 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">거래 내역</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}건
          </p>
        </div>
      </div>

      <TransactionFilter
        query={query}
        onChange={updateQuery}
        onReset={handleReset}
        searchPlaceholder="주문번호 검색..."
      />

      <TransactionTable
        transactions={transactions}
        isLoading={isLoading}
        onRefresh={() => void mutate()}
        hideMerchantColumn
        detailBasePath="/m/transactions"
      />

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />
    </div>
  );
}
