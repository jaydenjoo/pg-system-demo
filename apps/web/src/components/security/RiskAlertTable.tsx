"use client";

import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import type { RiskAlert } from "@/types/security";

interface RiskAlertTableProps {
  alerts: RiskAlert[];
  isLoading?: boolean | undefined;
  onResolve: (alert: RiskAlert) => void;
}

const SEVERITY_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "danger"
> = {
  LOW: "secondary",
  MEDIUM: "warning",
  HIGH: "danger",
  CRITICAL: "danger",
};

function buildColumns(
  onResolve: (alert: RiskAlert) => void,
): ColumnDef<RiskAlert>[] {
  return [
    {
      key: "created_at",
      header: "시간",
      className: "whitespace-nowrap",
      cell: (row) => (
        <span className="text-xs text-gray-500">
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      key: "alert_type",
      header: "알림유형",
      cell: (row) => <span className="text-gray-900">{row.alert_type}</span>,
    },
    {
      key: "severity",
      header: "심각도",
      cell: (row) => (
        <Badge variant={SEVERITY_VARIANT[row.severity] ?? "default"}>
          {row.severity}
        </Badge>
      ),
    },
    {
      key: "description",
      header: "설명",
      className: "max-w-xs truncate",
      cell: (row) => <span className="text-gray-700">{row.description}</span>,
    },
    {
      key: "status",
      header: "상태",
      cell: (row) => (
        <Badge variant={row.status === "RESOLVED" ? "success" : "warning"}>
          {row.status === "RESOLVED" ? "해결" : "미해결"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "처리",
      cell: (row) =>
        row.status !== "RESOLVED" ? (
          <Button size="sm" variant="outline" onClick={() => onResolve(row)}>
            해결 처리
          </Button>
        ) : null,
    },
  ];
}

export function RiskAlertTable({
  alerts,
  isLoading,
  onResolve,
}: RiskAlertTableProps) {
  const columns = buildColumns(onResolve);

  return (
    <DataTable
      columns={columns}
      data={alerts}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      emptyMessage="위험 알림이 없습니다."
    />
  );
}
