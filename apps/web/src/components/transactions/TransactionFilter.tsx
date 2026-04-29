"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TransactionQuery } from "@/types/transaction";

const STATUS_OPTIONS = [
  { value: "", label: "전체 상태" },
  { value: "PENDING", label: "대기" },
  { value: "APPROVED", label: "승인" },
  { value: "CANCELLED", label: "취소" },
  { value: "FAILED", label: "실패" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "전체 결제수단" },
  { value: "CARD", label: "카드" },
  { value: "BANK_TRANSFER", label: "계좌이체" },
  { value: "VIRTUAL_ACCOUNT", label: "가상계좌" },
  { value: "CASH", label: "현금" },
];

const TRAN_TYPE_OPTIONS = [
  { value: "", label: "전체 거래유형" },
  { value: "PAYMENT", label: "결제" },
  { value: "CANCEL", label: "취소" },
  { value: "PARTIAL_CANCEL", label: "부분취소" },
];

interface Props {
  query: TransactionQuery;
  onChange: (updates: Partial<TransactionQuery>) => void;
  onReset: () => void;
  searchPlaceholder?: string;
}

export function TransactionFilter({ query, onChange, onReset, searchPlaceholder = "주문번호 또는 가맹점 검색..." }: Props) {
  const [search, setSearch] = useState(query.search ?? "");

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onChange({ search });
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="w-64"
        />

        <select
          value={query.status ?? ""}
          onChange={(e) => onChange({ status: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={query.paymentMethod ?? ""}
          onChange={(e) => onChange({ paymentMethod: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PAYMENT_METHOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={query.tranType ?? ""}
          onChange={(e) => onChange({ tranType: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TRAN_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={query.startDate ?? ""}
          onChange={(e) => onChange({ startDate: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="self-center text-gray-400">~</span>
        <input
          type="date"
          value={query.endDate ?? ""}
          onChange={(e) => onChange({ endDate: e.target.value })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <Button variant="outline" size="sm" onClick={onReset}>
          초기화
        </Button>
        <Button size="sm" onClick={() => onChange({ search })}>
          검색
        </Button>
      </div>
    </div>
  );
}
