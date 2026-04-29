"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, formatDate } from "@/lib/format";
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
  transactions: Transaction[];
  isLoading: boolean;
  onRefresh: () => void;
  /** 가맹점명 컬럼 숨김 (가맹점 포탈용) */
  hideMerchantColumn?: boolean;
  /** 상세 페이지 기본 경로 (기본값: /transactions) */
  detailBasePath?: string;
}

export function TransactionTable({
  transactions,
  isLoading,
  hideMerchantColumn = false,
  detailBasePath = "/transactions",
}: Props) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-gray-400">
        거래 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              거래번호
            </th>
            {!hideMerchantColumn && (
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                가맹점
              </th>
            )}
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              거래유형
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              결제수단
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">
              금액
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">
              수수료
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">
              순금액
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              상태
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">
              거래일시
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {transactions.map((tx) => (
            <tr
              key={tx.id}
              onClick={() => router.push(`${detailBasePath}/${tx.id}`)}
              className="cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-blue-600">
                {tx.tran_no}
              </td>
              {!hideMerchantColumn && (
                <td className="px-4 py-3 text-gray-900">
                  {tx.merchants?.merchant_name ?? "-"}
                </td>
              )}
              <td className="px-4 py-3 text-gray-600">
                {TRAN_TYPE_LABELS[tx.tran_type]}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {tx.payment_method
                  ? PAYMENT_METHOD_LABELS[tx.payment_method]
                  : "-"}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">
                {formatAmount(tx.amount)}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {formatAmount(tx.fee_amount)}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">
                {formatAmount(tx.net_amount)}
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANTS[tx.status]}>
                  {STATUS_LABELS[tx.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {formatDate(tx.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
