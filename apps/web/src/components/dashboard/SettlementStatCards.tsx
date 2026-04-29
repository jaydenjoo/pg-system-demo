'use client';

import * as React from 'react';
import type { SettlementStat } from '@/types/dashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseAmount, formatKRW } from '@/lib/format';

interface SettlementStatCardsProps {
  stats: SettlementStat[];
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  CALCULATED: { label: '계산완료', bgColor: 'bg-blue-50', textColor: 'text-blue-700', dotColor: 'bg-blue-500' },
  CONFIRMED: { label: '확정', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700', dotColor: 'bg-indigo-500' },
  COMPLETED: { label: '완료', bgColor: 'bg-green-50', textColor: 'text-green-700', dotColor: 'bg-green-500' },
  PENDING: { label: '미확정', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700', dotColor: 'bg-yellow-500' },
  CANCELLED: { label: '취소', bgColor: 'bg-gray-50', textColor: 'text-gray-600', dotColor: 'bg-gray-400' },
  REMITTED: { label: '송금완료', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', dotColor: 'bg-emerald-500' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? {
    label: status,
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-600',
    dotColor: 'bg-gray-400',
  };
}

export function SettlementStatCards({ stats, isLoading = false }: SettlementStatCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-6 w-20 mb-1" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (stats.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => {
        const config = getStatusConfig(stat.status);
        const amount = parseAmount(stat.totalNetAmount);
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
