"use client";

import { formatDate } from "@/lib/format";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import type { AuditLog } from "@/types/security";

interface AuditLogTableProps {
  logs: AuditLog[];
  isLoading?: boolean | undefined;
}

const columns: ColumnDef<AuditLog>[] = [
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
    key: "user_id",
    header: "사용자 ID",
    cell: (row) => <span className="text-gray-900">{row.user_id ?? "-"}</span>,
  },
  {
    key: "action",
    header: "액션",
    cell: (row) => (
      <span className="font-medium text-gray-900">{row.action}</span>
    ),
  },
  {
    key: "resource_type",
    header: "리소스 타입",
    cell: (row) => <span className="text-gray-700">{row.resource_type}</span>,
  },
  {
    key: "resource_id",
    header: "리소스 ID",
    cell: (row) => (
      <span className="text-xs text-gray-500">{row.resource_id ?? "-"}</span>
    ),
  },
  {
    key: "ip_address",
    header: "IP",
    className: "whitespace-nowrap",
    cell: (row) => (
      <span className="text-xs text-gray-500">{row.ip_address ?? "-"}</span>
    ),
  },
];

export function AuditLogTable({ logs, isLoading }: AuditLogTableProps) {
  return (
    <DataTable
      columns={columns}
      data={logs}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      emptyMessage="감사 로그가 없습니다."
    />
  );
}
