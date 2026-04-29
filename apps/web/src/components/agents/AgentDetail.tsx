"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubAgentTree } from "@/components/agents/SubAgentTree";
import type { Agent, AgentStatus } from "@/types/agent";

interface AgentDetailProps {
  agent: Agent;
  onChanged?: () => void;
}

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "danger";

const STATUS_LABELS: Record<AgentStatus, string> = {
  ACTIVE: "활성",
  SUSPENDED: "정지",
  TERMINATED: "해지",
};

const STATUS_VARIANTS: Record<AgentStatus, BadgeVariant> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  TERMINATED: "default",
};

export function AgentDetail({ agent, onChanged }: AgentDetailProps) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">기본 정보</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">대리점 코드</dt>
            <dd className="font-mono font-medium text-gray-900">
              {agent.agent_code}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">대리점명</dt>
            <dd className="font-medium text-gray-900">{agent.agent_name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>
              <Badge variant={STATUS_VARIANTS[agent.status]}>
                {STATUS_LABELS[agent.status]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">등급</dt>
            <dd className="font-medium text-gray-900">
              {agent.tree_depth === 0 ? "본사" : `${agent.tree_depth}차`}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">상위 대리점</dt>
            <dd className="font-medium text-gray-900">
              {agent.parent_agent
                ? `[${agent.parent_agent.agent_code}] ${agent.parent_agent.agent_name}`
                : "최상위"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">등록일</dt>
            <dd className="font-medium text-gray-900">
              {new Date(agent.created_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">계약 정보</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">계약 시작일</dt>
            <dd className="font-medium text-gray-900">
              {agent.contract_start_date ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">계약 종료일</dt>
            <dd className="font-medium text-gray-900">
              {agent.contract_end_date ?? "-"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">은행 정보</h3>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">은행명</dt>
            <dd className="font-medium text-gray-900">
              {agent.bank_name ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">계좌번호</dt>
            <dd className="font-medium text-gray-900">
              {agent.bank_account ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">예금주</dt>
            <dd className="font-medium text-gray-900">
              {agent.bank_holder ?? "-"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">
          하위 대리점
        </h3>
        <SubAgentTree
          agentId={agent.id}
          {...(onChanged !== undefined ? { onChanged } : {})}
        />
      </Card>
    </div>
  );
}
