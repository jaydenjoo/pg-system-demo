"use client";

import * as React from "react";
import type { DailyTrend } from "@/types/dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseAmount, formatShortAmount } from "@/lib/format";

interface DailyTrendChartProps {
  data: DailyTrend[];
  isLoading?: boolean;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function DailyTrendChart({
  data,
  isLoading = false,
}: DailyTrendChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>일별 거래 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-40">
            {Array.from({ length: 15 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1"
                style={{ height: `${30 + ((i * 37 + 13) % 60)}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>일별 거래 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">
            데이터가 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  const parsed = data.map((d) => ({ ...d, numAmount: parseAmount(d.amount) }));
  const maxAmount = Math.max(...parsed.map((d) => d.numAmount), 1);
  const maxCount = Math.max(...parsed.map((d) => d.count), 1);

  const displayData = parsed.slice(-30);
  const showEvery = displayData.length > 15 ? 3 : 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>일별 거래 추이</CardTitle>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-blue-500" />
              거래금액
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
              거래건수
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div
            className="flex items-end gap-px h-40"
            aria-label="일별 거래 금액 바 차트"
          >
            {displayData.map((item) => {
              const heightPct =
                maxAmount > 0 ? (item.numAmount / maxAmount) * 100 : 0;
              const countHeightPct =
                maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              return (
                <div
                  key={item.date}
                  className="relative flex-1 flex flex-col justify-end group"
                  title={`${item.date}\n금액: ${new Intl.NumberFormat("ko-KR").format(item.numAmount)}원\n건수: ${item.count}건`}
                >
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gray-400"
                    style={{ bottom: `${countHeightPct}%` }}
                  />
                  <div
                    className="w-full bg-blue-500 rounded-t-sm transition-all group-hover:bg-blue-600"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: heightPct > 0 ? "2px" : "0",
                    }}
                  />
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    <div>{item.date}</div>
                    <div>{formatShortAmount(item.numAmount)}원</div>
                    <div>{item.count}건</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-px mt-1">
            {displayData.map((item, i) => (
              <div key={item.date} className="flex-1 text-center">
                {i % showEvery === 0 ? (
                  <span className="text-xs text-gray-400">
                    {formatShortDate(item.date)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span>
            합계:{" "}
            <strong className="text-gray-700">
              {formatShortAmount(parsed.reduce((s, d) => s + d.numAmount, 0))}원
            </strong>
          </span>
          <span>
            총{" "}
            <strong className="text-gray-700">
              {new Intl.NumberFormat("ko-KR").format(
                parsed.reduce((s, d) => s + d.count, 0),
              )}
            </strong>
            건
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
