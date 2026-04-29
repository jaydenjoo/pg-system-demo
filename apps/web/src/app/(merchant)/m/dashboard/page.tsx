"use client";

import * as React from "react";
import {
  CreditCard,
  Calculator,
  ArrowLeftRight,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { DailyTrendChart } from "@/components/dashboard/DailyTrendChart";
import {
  useDashboardSummary,
  useDailyTrend,
} from "@/hooks/use-dashboard";
import type { DashboardQuery } from "@/types/dashboard";

const PERIOD_OPTIONS = [
  { label: "오늘", days: 0 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
] as const;

function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (days > 0) {
    start.setDate(end.getDate() - days + 1);
  }
  const fmt = (d: Date): string => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

export default function MerchantDashboardPage(): React.JSX.Element {
  const [selectedDays, setSelectedDays] = React.useState<number>(30);

  const query: DashboardQuery = React.useMemo(
    () => getDateRange(selectedDays),
    [selectedDays],
  );

  const { summary, isLoading: summaryLoading } = useDashboardSummary(query);
  const { trend, isLoading: trendLoading } = useDailyTrend(query);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">내 가맹점 대시보드</h1>
          <p className="mt-0.5 text-sm text-gray-500">거래 및 정산 현황</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setSelectedDays(opt.days)}
              className={
                selectedDays === opt.days
                  ? "rounded-md px-3 py-1.5 text-sm font-medium bg-blue-600 text-white"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="총 거래금액"
          value={summary?.totalTransactionAmount ?? null}
          subLabel="거래건수"
          subValue={summary?.transactionCount ?? null}
          icon={CreditCard}
          iconClassName="bg-blue-50"
          isLoading={summaryLoading}
        />
        <StatCard
          label="총 정산금액"
          value={summary?.totalSettlementAmount ?? null}
          icon={Calculator}
          iconClassName="bg-indigo-50"
          isLoading={summaryLoading}
        />
        <StatCard
          label="미확정 정산"
          value={summary?.pendingSettlementCount ?? null}
          icon={ArrowLeftRight}
          iconClassName="bg-yellow-50"
          formatAsCurrency={false}
          isLoading={summaryLoading}
        />
      </div>

      <DailyTrendChart data={trend} isLoading={trendLoading} />
    </div>
  );
}
