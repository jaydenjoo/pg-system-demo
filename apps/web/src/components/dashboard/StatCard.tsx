'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { parseAmount, formatKRW, formatCount } from '@/lib/format';

interface StatCardProps {
  label: string;
  value: string | number | null;
  subLabel?: string;
  subValue?: number | null;
  icon?: LucideIcon;
  iconClassName?: string;
  formatAsCurrency?: boolean;
  isLoading?: boolean;
}

export function StatCard({
  label,
  value,
  subLabel,
  subValue,
  icon: Icon,
  iconClassName,
  formatAsCurrency = true,
  isLoading = false,
}: StatCardProps) {
  const displayValue = React.useMemo((): string => {
    if (value === null || value === undefined) return '-';
    const num = parseAmount(value);
    return formatAsCurrency ? formatKRW(num) : new Intl.NumberFormat('ko-KR').format(num);
  }, [value, formatAsCurrency]);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-500 truncate">{label}</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-7 w-32" />
            ) : (
              <p className="mt-1 text-2xl font-bold text-gray-900 truncate">
                {displayValue}
              </p>
            )}
            {subLabel && (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs text-gray-400">{subLabel}</span>
                {isLoading ? (
                  <Skeleton className="h-4 w-16" />
                ) : (
                  <span className="text-xs font-medium text-gray-600">
                    {subValue !== null && subValue !== undefined
                      ? formatCount(subValue)
                      : '-'}
                  </span>
                )}
              </div>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                'ml-4 flex-shrink-0 rounded-lg p-3 bg-blue-50',
                iconClassName,
              )}
            >
              <Icon className="h-6 w-6 text-blue-600" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
