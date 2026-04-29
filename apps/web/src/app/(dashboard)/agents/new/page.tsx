"use client";

import { useRouter } from "next/navigation";
import { AgentForm } from "@/components/agents/AgentForm";
import { useCreateAgent } from "@/hooks/use-agents";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { CreateAgentForm, UpdateAgentForm } from "@/types/agent";

export default function NewAgentPage() {
  const router = useRouter();
  const { createAgent, isLoading } = useCreateAgent();
  const { success, error } = useToast();

  const handleSubmit = async (data: CreateAgentForm | UpdateAgentForm) => {
    try {
      await createAgent(data as CreateAgentForm);
      success("대리점이 등록되었습니다.");
      router.push("/agents");
    } catch (err) {
      error(err instanceof Error ? err.message : "대리점 등록에 실패했습니다.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← 뒤로
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">대리점 추가</h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <AgentForm
          mode="create"
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
