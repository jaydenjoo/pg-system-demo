'use client';

import * as React from 'react';
import type { TopMerchant, TopAgent } from '@/types/dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseAmount, formatKRW } from '@/lib/format';

interface TopMerchantTableProps {
  merchants: TopMerchant[];
  isLoading?: boolean;
}

interface TopAgentTableProps {
  agents: TopAgent[];
  isLoading?: boolean;
}

export function TopMerchantTable({ merchants, isLoading = false }: TopMerchantTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>상위 가맹점 Top 5</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 pb-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : merchants.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-gray-400 text-center py-8">
            데이터가 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 w-8">#</th>
                <th className="text-left px-2 py-3 text-xs font-medium text-gray-500">가맹점</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500">거래금액</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500">건수</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m, idx) => (
                <tr key={m.merchantId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-400 font-medium">{idx + 1}</td>
                  <td className="px-2 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-[140px]">{m.merchantName}</div>
                    <div className="text-xs text-gray-400">{m.merchantCode}</div>
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900 tabular-nums">
                    {formatKRW(parseAmount(m.totalAmount))}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-600 tabular-nums">
                    {new Intl.NumberFormat('ko-KR').format(m.transactionCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function TopAgentTable({ agents, isLoading = false }: TopAgentTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>상위 대리점 Top 5</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 pb-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-gray-400 text-center py-8">
            데이터가 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 w-8">#</th>
                <th className="text-left px-2 py-3 text-xs font-medium text-gray-500">대리점</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500">수수료 합계</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500">건수</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, idx) => (
                <tr key={a.agentId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-400 font-medium">{idx + 1}</td>
                  <td className="px-2 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-[160px]">{a.agentName}</div>
                    <div className="text-xs text-gray-400">{a.agentCode}</div>
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900 tabular-nums">
                    {formatKRW(parseAmount(a.totalCommission))}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-600 tabular-nums">
                    {new Intl.NumberFormat('ko-KR').format(a.settlementCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
