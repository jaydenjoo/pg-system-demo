"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatAmount, formatDate, formatDateOnly } from "@/lib/format";
import type { Settlement, SettlementStatus } from "@/types/settlement";

const STATUS_LABELS: Record<SettlementStatus, string> = {
  CALCULATED: "산출",
  CONFIRMED: "확정",
  REMITTED: "송금",
  COMPLETED: "완료",
};

const STATUS_VARIANTS: Record<SettlementStatus, "default" | "success" | "warning" | "secondary"> = {
  CALCULATED: "warning",
  CONFIRMED: "secondary",
  REMITTED: "default",
  COMPLETED: "success",
};

interface Props {
  settlement: Settlement;
}

interface FieldRow {
  label: string;
  value: ReactNode;
}

export function SettlementDetail({ settlement: stl }: Props) {
  const fields: FieldRow[] = [
    { label: "가맹점", value: stl.merchants?.merchant_name ?? "-" },
    { label: "정산일", value: formatDateOnly(stl.settlement_date) },
    {
      label: "정산기간",
      value: `${formatDateOnly(stl.period_from)} ~ ${formatDateOnly(stl.period_to)}`,
    },
    {
      label: "거래금액",
      value: <span className="font-semibold">{formatAmount(stl.total_amount)}</span>,
    },
    { label: "수수료", value: formatAmount(stl.total_fee) },
    { label: "순금액", value: formatAmount(stl.total_net) },
    { label: "공제액", value: formatAmount(stl.deduction) },
    {
      label: "지급금액",
      value: <span className="font-semibold text-blue-600">{formatAmount(stl.payout_amount)}</span>,
    },
    { label: "거래건수", value: `${stl.tran_count.toLocaleString()}건` },
    { label: "취소건수", value: `${stl.cancel_count.toLocaleString()}건` },
    {
      label: "상태",
      value: (
        <Badge variant={STATUS_VARIANTS[stl.status]}>
          {STATUS_LABELS[stl.status]}
        </Badge>
      ),
    },
    { label: "송금일시", value: stl.remitted_at ? formatDate(stl.remitted_at) : "-" },
    { label: "생성일시", value: formatDate(stl.created_at) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-700">정산 상세 정보</h2>
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
