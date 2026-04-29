"use client";

import * as React from "react";
import {
  CreditCard,
  Landmark,
  ReceiptText,
  AlertCircle,
  Unlink,
  Store,
  Building2,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { DailyTrendChart } from "@/components/dashboard/DailyTrendChart";
import {
  TopMerchantTable,
  TopAgentTable,
} from "@/components/dashboard/TopRankingTable";
import { TransactionStatCards } from "@/components/dashboard/TransactionStatCards";
import { SettlementStatCards } from "@/components/dashboard/SettlementStatCards";
import {
  useDashboardSummary,
  useTransactionStats,
  useSettlementStats,
  useDailyTrend,
  useTopMerchants,
  useTopAgents,
} from "@/hooks/use-dashboard";
import type { DashboardQuery } from "@/types/dashboard";

const PERIOD_OPTIONS = [
  { label: "오늘", days: 0 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
] as const;

function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (days > 0) {
    start.setDate(end.getDate() - days + 1);
  }
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

export default function DashboardPage() {
  const [selectedDays, setSelectedDays] = React.useState<number>(30);

  const query: DashboardQuery = React.useMemo(() => {
    return getDateRange(selectedDays);
  }, [selectedDays]);

  const { summary, isLoading: summaryLoading } = useDashboardSummary(query);
  const { stats: txStats, isLoading: txStatsLoading } =
    useTransactionStats(query);
  const { stats: stlStats, isLoading: stlStatsLoading } =
    useSettlementStats(query);
  const { trend, isLoading: trendLoading } = useDailyTrend(query);
  const { merchants, isLoading: merchantsLoading } = useTopMerchants(query);
  const { agents, isLoading: agentsLoading } = useTopAgents(query);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="mt-0.5 text-sm text-gray-500">PG 시스템 현황</p>
        </div>
        {/* Period filter */}
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

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          icon={ReceiptText}
          iconClassName="bg-indigo-50"
          isLoading={summaryLoading}
        />
        <StatCard
          label="총 입금금액"
          value={summary?.totalDepositAmount ?? null}
          icon={Landmark}
          iconClassName="bg-green-50"
          isLoading={summaryLoading}
        />
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="미확정 정산"
            value={summary?.pendingSettlementCount ?? null}
            icon={AlertCircle}
            iconClassName="bg-yellow-50"
            formatAsCurrency={false}
            isLoading={summaryLoading}
          />
          <StatCard
            label="미매칭 입금"
            value={summary?.unmatchedDepositCount ?? null}
            icon={Unlink}
            iconClassName="bg-red-50"
            formatAsCurrency={false}
            isLoading={summaryLoading}
          />
        </div>
      </div>

      {/* Active counts */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="활성 가맹점"
          value={summary?.totalMerchants ?? null}
          icon={Store}
          iconClassName="bg-purple-50"
          formatAsCurrency={false}
          isLoading={summaryLoading}
        />
        <StatCard
          label="활성 대리점"
          value={summary?.totalAgents ?? null}
          icon={Building2}
          iconClassName="bg-orange-50"
          formatAsCurrency={false}
          isLoading={summaryLoading}
        />
      </div>

      {/* Transaction stats */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          거래 상태별 통계
        </h2>
        <TransactionStatCards stats={txStats} isLoading={txStatsLoading} />
      </div>

      {/* Settlement stats */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          정산 상태별 통계
        </h2>
        <SettlementStatCards stats={stlStats} isLoading={stlStatsLoading} />
      </div>

      {/* Daily trend chart */}
      <DailyTrendChart data={trend} isLoading={trendLoading} />

      {/* Top rankings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopMerchantTable merchants={merchants} isLoading={merchantsLoading} />
        <TopAgentTable agents={agents} isLoading={agentsLoading} />
      </div>
    </div>
  );
}
