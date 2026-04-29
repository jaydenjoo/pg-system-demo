"use client";

import { useState } from "react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteRole } from "@/hooks/use-roles";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@/types/auth";

interface RoleTableProps {
  roles: Role[];
  isLoading?: boolean | undefined;
  onRefresh: () => void;
  onEdit: (role: Role) => void;
}

export function RoleTable({
  roles,
  isLoading,
  onRefresh,
  onEdit,
}: RoleTableProps) {
  const { deleteRole, isLoading: isDeleting } = useDeleteRole();
  const { error: showError, success: showSuccess } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await deleteRole(deleteTarget.id);
      showSuccess("역할이 삭제되었습니다.");
      onRefresh();
    } catch {
      showError("역할 삭제에 실패했습니다.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<Role>[] = [
    {
      key: "name",
      header: "역할명",
      sortable: true,
      cell: (row) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: "description",
      header: "설명",
      cell: (row) => row.description ?? "-",
    },
    {
      key: "role_permissions",
      header: "권한 수",
      cell: (row) => (
        <Badge variant="secondary">
          {(row.role_permissions ?? []).length}개
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => onEdit(row)}>
            수정
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
        data={roles}
        rowKey={(row) => row.id}
        isLoading={isLoading ?? false}
        emptyMessage="역할이 없습니다."
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="역할 삭제"
        description={`'${deleteTarget?.name ?? ""}' 역할을 삭제하시겠습니까?`}
        isLoading={isDeleting}
      />
    </>
  );
}
