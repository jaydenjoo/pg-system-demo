"use client";

import { formatDateOnly } from "@/lib/format";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import type { Holiday } from "@/types/system";

interface HolidayListProps {
  holidays: Holiday[];
  isLoading?: boolean | undefined;
}

const columns: ColumnDef<Holiday>[] = [
  {
    key: "holiday_date",
    header: "날짜",
    cell: (row) => (
      <span className="text-gray-900">{formatDateOnly(row.holiday_date)}</span>
    ),
  },
  {
    key: "name",
    header: "공휴일명",
    cell: (row) => <span className="text-gray-900">{row.name}</span>,
  },
  {
    key: "year",
    header: "연도",
    className: "text-center",
    cell: (row) => <span className="text-gray-500">{row.year}</span>,
  },
];

export function HolidayList({ holidays, isLoading }: HolidayListProps) {
  return (
    <DataTable
      columns={columns}
      data={holidays}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      emptyMessage="등록된 공휴일이 없습니다."
    />
  );
}
