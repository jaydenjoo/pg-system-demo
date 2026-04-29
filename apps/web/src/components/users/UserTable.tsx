"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteUser } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@/types/auth";

interface UserTableProps {
  users: User[];
  isLoading?: boolean | undefined;
  onRefresh: () => void;
}

const USER_TYPE_LABELS: Record<string, string> = {
  ADMIN: "관리자",
  AGENT: "대리점",
  MERCHANT: "가맹점",
};

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "danger";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  LOCKED: "danger",
  DORMANT: "warning",
  WITHDRAWN: "default",
};

export function UserTable({ users, isLoading, onRefresh }: UserTableProps) {
  const router = useRouter();
  const { deleteUser, isLoading: isDeleting } = useDeleteUser();
  const { error: showError, success: showSuccess } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await deleteUser(deleteTarget.id);
      showSuccess("사용자가 삭제되었습니다.");
      onRefresh();
    } catch {
      showError("사용자 삭제에 실패했습니다.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      key: "login_id",
      header: "아이디",
      sortable: true,
      cell: (row) => (
        <span className="font-medium text-gray-900">{row.login_id}</span>
      ),
    },
    {
      key: "name",
      header: "이름",
      sortable: true,
      cell: (row) => row.name,
    },
    {
      key: "user_type",
      header: "유형",
      cell: (row) => (
        <Badge variant="secondary">
          {USER_TYPE_LABELS[row.user_type] ?? row.user_type}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "상태",
      cell: (row) => (
        <Badge variant={STATUS_VARIANTS[row.status] ?? "default"}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "email",
      header: "이메일",
      cell: (row) => row.email ?? "-",
    },
    {
      key: "created_at",
      header: "생성일",
      sortable: true,
      cell: (row) => new Date(row.created_at).toLocaleDateString("ko-KR"),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/users/${row.id}`)}
          >
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
        data={users}
        rowKey={(row) => row.id}
        isLoading={isLoading ?? false}
        emptyMessage="사용자가 없습니다."
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="사용자 삭제"
        description={`'${deleteTarget?.name ?? ""}' 사용자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        isLoading={isDeleting}
      />
    </>
  );
}
