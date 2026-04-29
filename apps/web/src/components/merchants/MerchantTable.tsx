"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MerchantStatusBadge } from "@/components/merchants/MerchantStatusBadge";
import { useDeleteMerchant } from "@/hooks/use-merchants";
import { useToast } from "@/hooks/use-toast";
import type { Merchant } from "@/types/merchant";

interface MerchantTableProps {
  merchants: Merchant[];
  isLoading?: boolean;
  onRefresh: () => void;
}

export function MerchantTable({
  merchants,
  isLoading,
  onRefresh,
}: MerchantTableProps) {
  const router = useRouter();
  const { deleteMerchant, isLoading: isDeleting } = useDeleteMerchant();
  const { error: showError, success: showSuccess } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Merchant | null>(null);

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await deleteMerchant(deleteTarget.id);
      showSuccess("가맹점이 삭제되었습니다.");
      onRefresh();
    } catch {
      showError("가맹점 삭제에 실패했습니다.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<Merchant>[] = [
    {
      key: "merchant_code",
      header: "코드",
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-sm font-medium text-gray-900">
          {row.merchant_code}
        </span>
      ),
    },
    {
      key: "merchant_name",
      header: "가맹점명",
      sortable: true,
      cell: (row) => (
        <button
          type="button"
          onClick={() => router.push(`/merchants/${row.id}`)}
          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {row.merchant_name}
        </button>
      ),
    },
    {
      key: "agent_name",
      header: "대리점",
      cell: (row) => row.agents?.agent_name ?? "-",
    },
    {
      key: "settlement_cycle",
      header: "정산주기",
      cell: (row) => {
        const labels: Record<string, string> = {
          "D+1": "D+1",
          "D+2": "D+2",
          "D+3": "D+3",
          WEEKLY: "주정산",
          MONTHLY: "월정산",
        };
        return row.settlement_cycle
          ? (labels[row.settlement_cycle] ?? row.settlement_cycle)
          : "-";
      },
    },
    {
      key: "status",
      header: "상태",
      cell: (row) => (
        <MerchantStatusBadge
          merchantId={row.id}
          status={row.status}
          editable
          onChanged={onRefresh}
        />
      ),
    },
    {
      key: "created_at",
      header: "등록일",
      sortable: true,
      cell: (row) => new Date(row.created_at).toLocaleDateString("ko-KR"),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/merchants/${row.id}`)}
          >
            수정
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteTarget(row)}
          >
            삭제
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={merchants}
        rowKey={(row) => row.id}
        isLoading={isLoading ?? false}
        emptyMessage="가맹점이 없습니다."
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="가맹점 삭제"
        description={`'${deleteTarget?.merchant_name ?? ""}' 가맹점을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        isLoading={isDeleting}
      />
    </>
  );
}
