"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AgentStatusBadge } from "@/components/agents/AgentStatusBadge";
import { useDeleteAgent } from "@/hooks/use-agents";
import { useToast } from "@/hooks/use-toast";
import type { Agent } from "@/types/agent";

interface AgentTableProps {
  agents: Agent[];
  isLoading?: boolean;
  onRefresh: () => void;
}

export function AgentTable({ agents, isLoading, onRefresh }: AgentTableProps) {
  const router = useRouter();
  const { deleteAgent, isLoading: isDeleting } = useDeleteAgent();
  const { error: showError, success: showSuccess } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await deleteAgent(deleteTarget.id);
      showSuccess("대리점이 삭제되었습니다.");
      onRefresh();
    } catch {
      showError("대리점 삭제에 실패했습니다.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<Agent>[] = [
    {
      key: "agent_code",
      header: "코드",
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-sm font-medium text-gray-900">
          {row.agent_code}
        </span>
      ),
    },
    {
      key: "agent_name",
      header: "대리점명",
      sortable: true,
      cell: (row) => (
        <button
          type="button"
          onClick={() => router.push(`/agents/${row.id}`)}
          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {row.agent_name}
        </button>
      ),
    },
    {
      key: "parent_agent",
      header: "상위 대리점",
      cell: (row) =>
        row.parent_agent?.agent_name ?? (
          <span className="text-gray-400">최상위</span>
        ),
    },
    {
      key: "tree_depth",
      header: "등급",
      cell: (row) => (
        <span className="text-sm text-gray-600">
          {row.tree_depth === 0 ? "본사" : `${row.tree_depth}차`}
        </span>
      ),
    },
    {
      key: "status",
      header: "상태",
      cell: (row) => (
        <AgentStatusBadge
          agentId={row.id}
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
            onClick={() => router.push(`/agents/${row.id}`)}
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
        data={agents}
        rowKey={(row) => row.id}
        isLoading={isLoading ?? false}
        emptyMessage="대리점이 없습니다."
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="대리점 삭제"
        description={`'${deleteTarget?.agent_name ?? ""}' 대리점을 삭제하시겠습니까? 하위 대리점이나 소속 가맹점이 있으면 삭제할 수 없습니다.`}
        isLoading={isDeleting}
      />
    </>
  );
}
