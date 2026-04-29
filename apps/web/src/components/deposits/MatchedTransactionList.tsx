"use client";

import { Button } from "@/components/ui/button";
import { formatAmount, formatDate } from "@/lib/format";
import { useUnmatch } from "@/hooks/use-deposits";
import type { MatchedTransaction } from "@/types/deposit";

interface Props {
  depositId: string;
  matches: MatchedTransaction[];
  onRefresh: () => void;
}

export function MatchedTransactionList({ depositId, matches, onRefresh }: Props) {
  const { unmatch, isLoading } = useUnmatch(depositId);

  const handleUnmatch = async (matchId: string): Promise<void> => {
    if (!confirm("이 매칭을 해제하시겠습니까?")) return;
    try {
      await unmatch(matchId);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "매칭 해제 실패");
    }
  };

  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-400">
        매칭된 거래가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-600">거래번호</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">가맹점</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">매칭금액</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">매칭일시</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {matches.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2 text-gray-700 text-xs">
                {m.transactions?.tran_no ?? m.transaction_id.slice(0, 8) + "…"}
              </td>
              <td className="px-4 py-2 text-gray-700">
                {m.transactions?.merchants?.merchant_name ?? "-"}
              </td>
              <td className="px-4 py-2 text-right font-medium text-gray-900">
                {formatAmount(m.matched_amount)}
              </td>
              <td className="px-4 py-2 text-gray-400 text-xs">
                {formatDate(m.created_at)}
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  onClick={() => handleUnmatch(m.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  해제
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
