"use client";

import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import type { LoginHistory } from "@/types/security";

interface LoginHistoryTableProps {
  history: LoginHistory[];
  isLoading?: boolean | undefined;
}

const RESULT_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "danger"
> = {
  SUCCESS: "success",
  FAILED: "danger",
  MFA_PENDING: "warning",
};

const RESULT_LABEL: Record<string, string> = {
  SUCCESS: "성공",
  FAILED: "실패",
  MFA_PENDING: "MFA 대기",
};

const columns: ColumnDef<LoginHistory>[] = [
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
    cell: (row) => <span className="text-gray-900">{row.user_id}</span>,
  },
  {
    key: "login_result",
    header: "결과",
    cell: (row) => (
      <Badge variant={RESULT_VARIANT[row.login_result] ?? "default"}>
        {RESULT_LABEL[row.login_result] ?? row.login_result}
      </Badge>
    ),
  },
  {
    key: "ip_address",
    header: "IP",
    className: "whitespace-nowrap",
    cell: (row) => (
      <span className="text-xs text-gray-500">{row.ip_address}</span>
    ),
  },
  {
    key: "mfa_type",
    header: "MFA",
    cell: (row) => (
      <span className="text-xs text-gray-500">{row.mfa_type ?? "-"}</span>
    ),
  },
  {
    key: "user_agent",
    header: "User Agent",
    className: "max-w-[200px] truncate",
    cell: (row) => (
      <span className="text-xs text-gray-400">{row.user_agent ?? "-"}</span>
    ),
  },
];

export function LoginHistoryTable({
  history,
  isLoading,
}: LoginHistoryTableProps) {
  return (
    <DataTable
      columns={columns}
      data={history}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      emptyMessage="로그인 이력이 없습니다."
    />
  );
}
