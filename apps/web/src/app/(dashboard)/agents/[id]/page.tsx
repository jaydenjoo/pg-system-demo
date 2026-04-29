"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAgent, useUpdateAgent } from "@/hooks/use-agents";
import { AgentDetail } from "@/components/agents/AgentDetail";
import { AgentForm } from "@/components/agents/AgentForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { CreateAgentForm, UpdateAgentForm } from "@/types/agent";

type Tab = "detail" | "edit";

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = params.id;

  const { agent, isLoading, mutate } = useAgent(agentId);
  const { updateAgent, isLoading: isUpdating } = useUpdateAgent(agentId);
  const { success, error } = useToast();
  const [tab, setTab] = useState<Tab>("detail");

  const handleUpdate = async (data: CreateAgentForm | UpdateAgentForm) => {
    try {
      await updateAgent(data as UpdateAgentForm);
      success("대리점 정보가 수정되었습니다.");
      await mutate();
      setTab("detail");
    } catch (err) {
      error(err instanceof Error ? err.message : "수정에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (agent === null) {
    return (
      <div className="py-12 text-center text-gray-400">
        대리점을 찾을 수 없습니다.
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "detail", label: "상세 정보" },
    { key: "edit", label: "정보 수정" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← 뒤로
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {agent.agent_name}
          </h1>
          <p className="font-mono text-sm text-gray-500">{agent.agent_code}</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {tab === "detail" && (
          <AgentDetail agent={agent} onChanged={() => void mutate()} />
        )}
        {tab === "edit" && (
          <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <AgentForm
              mode="edit"
              agent={agent}
              onSubmit={handleUpdate}
              isLoading={isUpdating}
              onCancel={() => setTab("detail")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
