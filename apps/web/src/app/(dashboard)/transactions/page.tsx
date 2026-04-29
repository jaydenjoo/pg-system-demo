"use client";

import { useState } from "react";
import { useTransactions } from "@/hooks/use-transactions";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { TransactionFilter } from "@/components/transactions/TransactionFilter";
import { Pagination } from "@/components/ui/pagination";
import type { TransactionQuery } from "@/types/transaction";

export default function TransactionsPage() {
  const [query, setQuery] = useState<TransactionQuery>({
    page: 1,
    limit: 20,
  });

  const { transactions, meta, isLoading, mutate } = useTransactions(query);

  const updateQuery = (updates: Partial<TransactionQuery>) => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = () => {
    setQuery({ page: 1, limit: 20 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">거래 내역</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}건
          </p>
        </div>
      </div>

      <TransactionFilter query={query} onChange={updateQuery} onReset={handleReset} />

      <TransactionTable
        transactions={transactions}
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
