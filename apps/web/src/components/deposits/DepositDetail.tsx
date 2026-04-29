"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatAmount, formatDate, formatDateOnly } from "@/lib/format";
import type { Deposit, ReconcileStatus } from "@/types/deposit";

const STATUS_LABELS: Record<ReconcileStatus, string> = {
  PENDING: "대기",
  MATCHED: "매칭완료",
  MISMATCHED: "불일치",
  MANUAL: "수동처리",
};

const STATUS_VARIANTS: Record<ReconcileStatus, "success" | "warning" | "danger"> = {
  PENDING: "warning",
  MATCHED: "success",
  MISMATCHED: "danger",
  MANUAL: "warning",
};

interface FieldRow {
  label: string;
  value: ReactNode;
}

interface Props {
  deposit: Deposit;
}

export function DepositDetail({ deposit: dep }: Props) {
  const fields: FieldRow[] = [
    { label: "입금일", value: formatDateOnly(dep.deposit_date) },
    { label: "입금출처", value: dep.source },
    {
      label: "입금금액",
      value: (
        <span className="font-semibold">{formatAmount(dep.amount)}</span>
      ),
    },
    {
      label: "매칭금액",
      value: (
        <span className="text-green-700 font-medium">
          {formatAmount(dep.matched_amount)}
        </span>
      ),
    },
    {
      label: "미매칭금액",
      value: (
        <span className="text-red-600 font-medium">
          {formatAmount(dep.unmatched_amount)}
        </span>
      ),
    },
    {
      label: "대사상태",
      value: (
        <Badge variant={STATUS_VARIANTS[dep.reconcile_status]}>
          {STATUS_LABELS[dep.reconcile_status]}
        </Badge>
      ),
    },
    { label: "등록일시", value: formatDate(dep.created_at) },
    { label: "수정일시", value: formatDate(dep.updated_at) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-700">입금 상세 정보</h2>
      </div>
      <dl className="divide-y divide-gray-100">
        {fields.map((field) => (
          <div key={field.label} className="grid grid-cols-3 gap-4 px-6 py-3">
            <dt className="text-sm font-medium text-gray-500">{field.label}</dt>
            <dd className="col-span-2 text-sm text-gray-900">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
