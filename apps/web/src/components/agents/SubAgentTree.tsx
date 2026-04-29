"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubAgents } from "@/hooks/use-agents";
import { AgentStatusBadge } from "@/components/agents/AgentStatusBadge";
import type { AgentStatus } from "@/types/agent";

interface SubAgentNodeProps {
  id: string;
  agentCode: string;
  agentName: string;
  status: AgentStatus;
  treeDepth: number;
  onChanged?: () => void;
}

function SubAgentNode({
  id,
  agentCode,
  agentName,
  status,
  treeDepth,
  onChanged,
}: SubAgentNodeProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { subAgents, isLoading } = useSubAgents(expanded ? id : null);

  return (
    <li>
      <div className="flex items-center gap-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-4 text-xs text-gray-400 hover:text-gray-600"
        >
          {expanded ? "▾" : "▸"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/agents/${id}`)}
          className="font-medium text-blue-600 hover:underline"
        >
          [{agentCode}] {agentName}
        </button>
        <span className="text-xs text-gray-400">{treeDepth}차</span>
        <AgentStatusBadge
          agentId={id}
          status={status}
          editable
          {...(onChanged !== undefined ? { onChanged } : {})}
        />
      </div>

      {expanded && (
        <ul className="ml-6 border-l border-gray-200 pl-4">
          {isLoading ? (
            <li className="py-1 text-xs text-gray-400">로딩 중...</li>
          ) : subAgents.length === 0 ? (
            <li className="py-1 text-xs text-gray-400">하위 대리점 없음</li>
          ) : (
            subAgents.map((sub) => (
              <SubAgentNode
                key={sub.id}
                id={sub.id}
                agentCode={sub.agent_code}
                agentName={sub.agent_name}
                status={sub.status}
                treeDepth={sub.tree_depth}
                {...(onChanged !== undefined ? { onChanged } : {})}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

interface SubAgentTreeProps {
  agentId: string;
  onChanged?: () => void;
}

export function SubAgentTree({ agentId, onChanged }: SubAgentTreeProps) {
  const { subAgents, isLoading } = useSubAgents(agentId);

  if (isLoading) {
    return <p className="text-sm text-gray-400">로딩 중...</p>;
  }

  if (subAgents.length === 0) {
    return <p className="text-sm text-gray-400">하위 대리점이 없습니다.</p>;
  }

  return (
    <ul className="space-y-0.5 text-sm">
      {subAgents.map((sub) => (
        <SubAgentNode
          key={sub.id}
          id={sub.id}
          agentCode={sub.agent_code}
          agentName={sub.agent_name}
          status={sub.status}
          treeDepth={sub.tree_depth}
          {...(onChanged !== undefined ? { onChanged } : {})}
        />
      ))}
    </ul>
  );
}
