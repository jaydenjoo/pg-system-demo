"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useChangeAgentStatus } from "@/hooks/use-agents";
import { useToast } from "@/hooks/use-toast";
import type { AgentStatus } from "@/types/agent";

const STATUS_LABELS: Record<AgentStatus, string> = {
  ACTIVE: "활성",
  SUSPENDED: "정지",
  TERMINATED: "해지",
};

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "danger";

const STATUS_VARIANTS: Record<AgentStatus, BadgeVariant> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  TERMINATED: "default",
};

const STATUS_OPTIONS: AgentStatus[] = ["ACTIVE", "SUSPENDED", "TERMINATED"];

interface AgentStatusBadgeProps {
  agentId: string;
  status: AgentStatus;
  editable?: boolean;
  onChanged?: () => void;
}

export function AgentStatusBadge({
  agentId,
  status,
  editable = false,
  onChanged,
}: AgentStatusBadgeProps) {
  const [open, setOpen] = useState(false);
  const { changeStatus, isLoading } = useChangeAgentStatus(agentId);
  const { success, error: showError } = useToast();

  const handleChange = async (newStatus: AgentStatus) => {
    if (newStatus === status) {
      setOpen(false);
      return;
    }
    try {
      await changeStatus({ status: newStatus });
      success(`상태가 ${STATUS_LABELS[newStatus]}(으)로 변경되었습니다.`);
      onChanged?.();
    } catch {
      showError("상태 변경에 실패했습니다.");
    } finally {
      setOpen(false);
    }
  };

  if (!editable) {
    return (
      <Badge variant={STATUS_VARIANTS[status]}>
        {STATUS_LABELS[status]}
      </Badge>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={isLoading}
        className="focus:outline-none"
      >
        <Badge variant={STATUS_VARIANTS[status]} className="cursor-pointer">
          {isLoading ? "변경 중..." : STATUS_LABELS[status]} ▾
        </Badge>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded-md border border-gray-200 bg-white shadow-lg">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void handleChange(s)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                  s === status ? "font-semibold" : ""
                }`}
              >
                <Badge variant={STATUS_VARIANTS[s]} className="text-xs">
                  {STATUS_LABELS[s]}
                </Badge>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
