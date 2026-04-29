'use client';

import * as React from 'react';
import type { TransactionStatsResponse } from '@/types/dashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseAmount, formatKRW } from '@/lib/format';

interface TransactionStatCardsProps {
  stats: TransactionStatsResponse | null;
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  COMPLETED: { label: '완료', bgColor: 'bg-green-50', textColor: 'text-green-700', dotColor: 'bg-green-500' },
  PENDING: { label: '대기', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700', dotColor: 'bg-yellow-500' },
  FAILED: { label: '실패', bgColor: 'bg-red-50', textColor: 'text-red-700', dotColor: 'bg-red-500' },
  CANCELLED: { label: '취소', bgColor: 'bg-gray-50', textColor: 'text-gray-600', dotColor: 'bg-gray-400' },
  PROCESSING: { label: '처리중', bgColor: 'bg-blue-50', textColor: 'text-blue-700', dotColor: 'bg-blue-500' },
  APPROVED: { label: '승인', bgColor: 'bg-green-50', textColor: 'text-green-700', dotColor: 'bg-green-500' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? {
    label: status,
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-600',
    dotColor: 'bg-gray-400',
  };
}

export function TransactionStatCards({ stats, isLoading = false }: TransactionStatCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-12 mb-2" />
              <Skeleton className="h-6 w-20 mb-1" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const byStatus = stats?.byStatus ?? [];
  if (byStatus.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {byStatus.map((stat) => {
        const config = getStatusConfig(stat.status);
        const amount = parseAmount(stat.totalAmount);
        return (
          <Card key={stat.status} className={config.bgColor}>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`inline-block h-2 w-2 rounded-full ${config.dotColor}`} />
                <span className={`text-xs font-medium ${config.textColor}`}>{config.label}</span>
              </div>
              <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">
                {formatKRW(amount)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Intl.NumberFormat('ko-KR').format(stat.count)}건
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
