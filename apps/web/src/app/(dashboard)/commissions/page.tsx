"use client";

import { useEffect, useState } from "react";
import {
  usePgMargins,
  useAgentCommissions,
  useMerchantCommissions,
  useCommissionHistory,
  useSetAgentCommission,
  useSetMerchantCommission,
} from "@/hooks/use-commissions";
import { useAgents } from "@/hooks/use-agents";
import { useMerchants } from "@/hooks/use-merchants";
import { PgMarginTable } from "@/components/commissions/PgMarginTable";
import { PgMarginForm } from "@/components/commissions/PgMarginForm";
import { CommissionTierView } from "@/components/commissions/CommissionTierView";
import { CommissionHistoryTable } from "@/components/commissions/CommissionHistoryTable";
import { SetCommissionForm } from "@/components/commissions/SetCommissionForm";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { SetAgentCommissionForm } from "@/types/commission";

type Tab = "pg" | "agent" | "merchant";

export default function CommissionsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pg");
  const [showPgForm, setShowPgForm] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [entityId, setEntityId] = useState("");

  const { agents } = useAgents({ page: 1, limit: 100 });
  const { merchants } = useMerchants({ page: 1, limit: 100 });

  const { margins, isLoading: pgLoading, mutate: mutatePg } = usePgMargins();
  const {
    commissions: agentCommissions,
    isLoading: agentLoading,
    mutate: mutateAgent,
  } = useAgentCommissions(activeTab === "agent" && entityId ? entityId : null);
  const {
    commissions: merchantCommissions,
    isLoading: merchantLoading,
    mutate: mutateMerchant,
  } = useMerchantCommissions(
    activeTab === "merchant" && entityId ? entityId : null,
  );
  const { history, isLoading: historyLoading } = useCommissionHistory(
    entityId ? (activeTab === "agent" ? "agent" : "merchant") : null,
    entityId || null,
  );
  const { setCommission: setAgentComm, isLoading: agentSaving } =
    useSetAgentCommission(entityId);
  const { setCommission: setMerchantComm, isLoading: merchantSaving } =
    useSetMerchantCommission(entityId);

  const { success, error } = useToast();

  const tabs: { key: Tab; label: string }[] = [
    { key: "pg", label: "PG 마진" },
    { key: "agent", label: "대리점 수수료" },
    { key: "merchant", label: "가맹점 수수료" },
  ];

  // 탭 전환 시 기본값 자동 선택 (사용자가 ID 외울 필요 없음)
  useEffect(() => {
    if (activeTab === "agent" && agents.length > 0 && entityId === "") {
      setEntityId(agents[0].id);
    } else if (activeTab === "merchant" && merchants.length > 0 && entityId === "") {
      setEntityId(merchants[0].id);
    }
  }, [activeTab, agents, merchants, entityId]);

  const handlePgSuccess = async () => {
    success("PG 마진이 저장되었습니다.");
    await mutatePg();
    setShowPgForm(false);
  };

  const handleSetCommission = async (form: SetAgentCommissionForm) => {
    try {
      if (activeTab === "agent") {
        await setAgentComm(form);
        await mutateAgent();
      } else {
        await setMerchantComm(form);
        await mutateMerchant();
      }
      success("수수료가 저장되었습니다.");
      setShowEntityForm(false);
    } catch (err) {
      error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  };

  const isSaving = agentSaving || merchantSaving;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">수수료 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            PG 마진 및 대리점/가맹점 수수료 설정
          </p>
        </div>
        {activeTab === "pg" && (
          <Button onClick={() => setShowPgForm(true)}>+ PG 마진 추가</Button>
        )}
        {(activeTab === "agent" || activeTab === "merchant") && entityId && (
          <Button onClick={() => setShowEntityForm(true)}>+ 수수료 설정</Button>
        )}
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setEntityId("");
            }}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* PG 마진 탭 */}
      {activeTab === "pg" && (
        <div className="space-y-6">
          <PgMarginTable margins={margins} isLoading={pgLoading} />

          {/* 3계층 비교 뷰 (첫 번째 대리점/가맹점 없을 때는 숨김) */}
          {margins.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold text-gray-800">
                3계층 수수료 비교
              </h2>
              <CommissionTierView
                pgMargins={margins}
                agentCommissions={[]}
                merchantCommissions={[]}
              />
            </div>
          )}
        </div>
      )}

      {/* 대리점 / 가맹점 수수료 탭 */}
      {(activeTab === "agent" || activeTab === "merchant") && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">
              {activeTab === "agent" ? "대리점 선택" : "가맹점 선택"}
            </label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {activeTab === "agent"
                ? agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.agent_code}] {a.agent_name}
                    </option>
                  ))
                : merchants.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.merchant_code}] {m.merchant_name}
                    </option>
                  ))}
            </select>
          </div>

          {entityId && (
            <>
              <div>
                <h2 className="mb-3 text-base font-semibold text-gray-800">
                  수수료 설정
                </h2>
                {activeTab === "agent" ? (
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <CommissionHistoryLike
                      items={agentCommissions}
                      isLoading={agentLoading}
                    />
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <CommissionHistoryLike
                      items={merchantCommissions}
                      isLoading={merchantLoading}
                    />
                  </div>
                )}
              </div>

              <div>
                <h2 className="mb-3 text-base font-semibold text-gray-800">
                  3계층 수수료 비교
                </h2>
                <CommissionTierView
                  pgMargins={margins}
                  agentCommissions={
                    activeTab === "agent" ? agentCommissions : []
                  }
                  merchantCommissions={
                    activeTab === "merchant" ? merchantCommissions : []
                  }
                />
              </div>

              <div>
                <h2 className="mb-3 text-base font-semibold text-gray-800">
                  변경 이력
                </h2>
                <CommissionHistoryTable
                  history={history}
                  isLoading={historyLoading}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* PG 마진 추가 다이얼로그 */}
      <Dialog
        open={showPgForm}
        onClose={() => setShowPgForm(false)}
        title="PG 마진 추가"
      >
        <PgMarginForm
          onSuccess={handlePgSuccess}
          onCancel={() => setShowPgForm(false)}
        />
      </Dialog>

      {/* 대리점/가맹점 수수료 설정 다이얼로그 */}
      <Dialog
        open={showEntityForm}
        onClose={() => setShowEntityForm(false)}
        title={
          activeTab === "agent" ? "대리점 수수료 설정" : "가맹점 수수료 설정"
        }
      >
        <SetCommissionForm
          entityLabel={activeTab === "agent" ? "대리점" : "가맹점"}
          onSubmit={handleSetCommission}
          onCancel={() => setShowEntityForm(false)}
          isLoading={isSaving}
        />
      </Dialog>
    </div>
  );
}

/** 수수료 목록 테이블 (공통) */
interface CommissionItem {
  id: string;
  payment_method: string;
  card_company: string | null;
  commission_rate: string;
  effective_from: string;
  effective_to: string | null;
}

function CommissionHistoryLike({
  items,
  isLoading,
}: {
  items: CommissionItem[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="px-4 py-6 text-sm text-gray-400">불러오는 중...</p>;
  }
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-gray-400">수수료 설정이 없습니다.</p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-gray-200 bg-gray-50">
        <tr>
          <th className="px-4 py-2 text-left font-medium text-gray-600">
            결제수단
          </th>
          <th className="px-4 py-2 text-left font-medium text-gray-600">
            카드사
          </th>
          <th className="px-4 py-2 text-right font-medium text-gray-600">
            수수료율
          </th>
          <th className="px-4 py-2 text-left font-medium text-gray-600">
            적용기간
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {items.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50">
            <td className="px-4 py-2 text-gray-900">{item.payment_method}</td>
            <td className="px-4 py-2 text-gray-900">
              {item.card_company ?? "공통"}
            </td>
            <td className="px-4 py-2 text-right font-semibold text-gray-900">
              {Number(item.commission_rate).toFixed(2)}%
            </td>
            <td className="px-4 py-2 text-gray-500 text-xs">
              {item.effective_from}
              {item.effective_to !== null ? ` ~ ${item.effective_to}` : " ~"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
