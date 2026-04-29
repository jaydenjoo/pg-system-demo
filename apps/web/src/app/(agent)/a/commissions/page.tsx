"use client";

import { Percent } from "lucide-react";
import { useAgentCommissions } from "@/hooks/use-commissions";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateOnly } from "@/lib/format";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD: "카드",
  BANK_TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
  CASH: "현금",
};

export default function AgentCommissionsPage(): React.JSX.Element {
  // agentId는 OwnershipInterceptor가 JWT에서 자동 주입하므로 빈 문자열 전달
  // 실제로는 hook 내부에서 /commissions/agents API를 호출하며
  // 백엔드 인터셉터가 JWT의 agentId로 필터링
  const { commissions, isLoading } = useAgentCommissions("");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Percent className="h-6 w-6 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">수수료</h1>
          <p className="mt-0.5 text-sm text-gray-500">대리점 수수료율 현황</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : commissions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-gray-400">
          등록된 수수료 정보가 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">결제수단</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">카드사</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">수수료율</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">적용시작</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">적용종료</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">
                    {PAYMENT_METHOD_LABELS[c.payment_method] ?? c.payment_method}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.card_company ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {c.commission_rate}%
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatDateOnly(c.effective_from)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.effective_to ? formatDateOnly(c.effective_to) : "무기한"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
