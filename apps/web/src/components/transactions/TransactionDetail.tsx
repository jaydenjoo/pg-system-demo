"use client";

import { Badge } from "@/components/ui/badge";
import { formatAmount, formatDate } from "@/lib/format";
import type { ReactNode } from "react";
import type {
  Transaction,
  TransactionStatus,
  PaymentMethod,
  TransactionType,
} from "@/types/transaction";

const STATUS_LABELS: Record<TransactionStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  CANCELLED: "취소",
  FAILED: "실패",
};

const STATUS_VARIANTS: Record<
  TransactionStatus,
  "default" | "success" | "warning" | "danger"
> = {
  PENDING: "warning",
  APPROVED: "success",
  CANCELLED: "default",
  FAILED: "danger",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: "카드",
  BANK_TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
  CASH: "현금",
};

const TRAN_TYPE_LABELS: Record<TransactionType, string> = {
  PAYMENT: "결제",
  CANCEL: "취소",
  PARTIAL_CANCEL: "부분취소",
};

interface Props {
  transaction: Transaction;
}

interface FieldRow {
  label: string;
  value: ReactNode;
}

export function TransactionDetail({ transaction: tx }: Props) {
  const cancelReason =
    tx.payment_detail && typeof tx.payment_detail === "object"
      ? (tx.payment_detail as Record<string, unknown>).cancelReason
      : null;

  const fields: FieldRow[] = [
    {
      label: "거래번호",
      value: <span className="font-mono text-blue-600">{tx.tran_no}</span>,
    },
    {
      label: "주문번호",
      value: <span className="font-mono">{tx.order_no}</span>,
    },
    { label: "주문명", value: tx.order_name ?? "-" },
    { label: "가맹점", value: tx.merchants?.merchant_name ?? "-" },
    {
      label: "단말기",
      value: tx.merchant_terminals?.terminal_name ?? "-",
    },
    { label: "거래유형", value: TRAN_TYPE_LABELS[tx.tran_type] },
    {
      label: "결제수단",
      value: tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] : "-",
    },
    {
      label: "거래금액",
      value: <span className="font-semibold">{formatAmount(tx.amount)}</span>,
    },
    { label: "수수료", value: formatAmount(tx.fee_amount) },
    { label: "부가세", value: formatAmount(tx.vat_amount) },
    {
      label: "순금액",
      value: (
        <span className="font-semibold">{formatAmount(tx.net_amount)}</span>
      ),
    },
    {
      label: "상태",
      value: (
        <Badge variant={STATUS_VARIANTS[tx.status]}>
          {STATUS_LABELS[tx.status]}
        </Badge>
      ),
    },
    {
      label: "취소사유",
      value: typeof cancelReason === "string" ? cancelReason : "-",
    },
    {
      label: "승인일시",
      value: tx.approved_at ? formatDate(tx.approved_at) : "-",
    },
    {
      label: "취소일시",
      value: tx.cancelled_at ? formatDate(tx.cancelled_at) : "-",
    },
    { label: "거래일시", value: formatDate(tx.created_at) },
    { label: "수정일시", value: formatDate(tx.updated_at) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-700">거래 상세 정보</h2>
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
