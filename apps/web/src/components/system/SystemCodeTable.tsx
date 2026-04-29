"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import type { SystemCode } from "@/types/system";

interface SystemCodeTableProps {
  codes: SystemCode[];
  isLoading?: boolean | undefined;
  onEdit: (code: SystemCode) => void;
  onDelete: (code: SystemCode) => void;
}

function buildColumns(
  onEdit: (code: SystemCode) => void,
  onDelete: (code: SystemCode) => void,
): ColumnDef<SystemCode>[] {
  return [
    {
      key: "group_code",
      header: "그룹코드",
      cell: (row) => (
        <span className="font-mono text-xs text-gray-700">
          {row.group_code}
        </span>
      ),
    },
    {
      key: "code",
      header: "코드",
      cell: (row) => (
        <span className="font-mono text-xs text-gray-700">{row.code}</span>
      ),
    },
    {
      key: "name",
      header: "이름",
      cell: (row) => <span className="text-gray-900">{row.name}</span>,
    },
    {
      key: "sort_order",
      header: "순서",
      className: "text-center",
      cell: (row) => <span className="text-gray-500">{row.sort_order}</span>,
    },
    {
      key: "extra_value1",
      header: "부가값1",
      cell: (row) => (
        <span className="text-xs text-gray-500">{row.extra_value1 ?? "-"}</span>
      ),
    },
    {
      key: "extra_value2",
      header: "부가값2",
      cell: (row) => (
        <span className="text-xs text-gray-500">{row.extra_value2 ?? "-"}</span>
      ),
    },
    {
      key: "is_active",
      header: "활성",
      className: "text-center",
      cell: (row) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? "활성" : "비활성"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "관리",
      className: "text-center",
      cell: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
            수정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            onClick={() => onDelete(row)}
          >
            삭제
          </Button>
        </div>
      ),
    },
  ];
}

export function SystemCodeTable({
  codes,
  isLoading,
  onEdit,
  onDelete,
}: SystemCodeTableProps) {
  const columns = buildColumns(onEdit, onDelete);

  return (
    <DataTable
      columns={columns}
      data={codes}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      emptyMessage="시스템 코드가 없습니다."
    />
  );
}
