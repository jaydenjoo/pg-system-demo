"use client";

import { useState } from "react";
import {
  useAuditLogs,
  useRiskAlerts,
  useResolveRiskAlert,
  useLoginHistory,
} from "@/hooks/use-security";
import { AuditLogTable } from "@/components/security/AuditLogTable";
import { AuditLogFilter } from "@/components/security/AuditLogFilter";
import { RiskAlertTable } from "@/components/security/RiskAlertTable";
import { RiskAlertFilter } from "@/components/security/RiskAlertFilter";
import { RiskAlertResolveDialog } from "@/components/security/RiskAlertResolveDialog";
import { LoginHistoryTable } from "@/components/security/LoginHistoryTable";
import { LoginHistoryFilter } from "@/components/security/LoginHistoryFilter";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import type {
  RiskAlert,
  AuditLogQuery,
  RiskAlertQuery,
  LoginHistoryQuery,
} from "@/types/security";

type Tab = "audit" | "risk" | "login";

const DEFAULT_LIMIT = 20;

const TABS: { key: Tab; label: string }[] = [
  { key: "audit", label: "감사 로그" },
  { key: "risk", label: "위험 알림" },
  { key: "login", label: "로그인 이력" },
];

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<Tab>("audit");

  /* 쿼리 객체 상태 */
  const [auditQuery, setAuditQuery] = useState<AuditLogQuery>({
    page: 1,
    limit: DEFAULT_LIMIT,
  });
  const [riskQuery, setRiskQuery] = useState<RiskAlertQuery>({
    page: 1,
    limit: DEFAULT_LIMIT,
  });
  const [loginQuery, setLoginQuery] = useState<LoginHistoryQuery>({
    page: 1,
    limit: DEFAULT_LIMIT,
  });

  /* 위험 알림 해결 대상 */
  const [resolveTarget, setResolveTarget] = useState<RiskAlert | null>(null);

  /* hooks */
  const {
    logs,
    meta: auditMeta,
    isLoading: auditLoading,
  } = useAuditLogs(auditQuery);

  const {
    alerts,
    meta: riskMeta,
    isLoading: riskLoading,
    mutate: mutateRisk,
  } = useRiskAlerts(riskQuery);

  const { resolve, isLoading: resolving } = useResolveRiskAlert();

  const {
    history,
    meta: loginMeta,
    isLoading: loginLoading,
  } = useLoginHistory(loginQuery);

  const { success, error: toastError } = useToast();

  const handleResolve = async (): Promise<void> => {
    if (resolveTarget === null) return;
    try {
      await resolve(resolveTarget.id);
      success("위험 알림이 해결 처리되었습니다.");
      setResolveTarget(null);
      await mutateRisk();
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "해결 처리에 실패했습니다.",
      );
    }
  };

  const handleAuditSearch = (): void => {
    setAuditQuery((prev) => ({ ...prev, page: 1 }));
  };

  const handleAuditReset = (): void => {
    setAuditQuery({ page: 1, limit: DEFAULT_LIMIT });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">보안 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          감사 로그, 위험 알림, 로그인 이력 조회
        </p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
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

      {/* 감사 로그 */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <AuditLogFilter
            query={auditQuery}
            onChange={setAuditQuery}
            onSearch={handleAuditSearch}
            onReset={handleAuditReset}
          />
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <AuditLogTable logs={logs} isLoading={auditLoading} />
          </div>
          <Pagination
            page={auditMeta.page}
            totalPages={auditMeta.totalPages}
            onPageChange={(p) =>
              setAuditQuery((prev) => ({ ...prev, page: p }))
            }
          />
        </div>
      )}

      {/* 위험 알림 */}
      {activeTab === "risk" && (
        <div className="space-y-4">
          <RiskAlertFilter query={riskQuery} onChange={setRiskQuery} />
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <RiskAlertTable
              alerts={alerts}
              isLoading={riskLoading}
              onResolve={setResolveTarget}
            />
          </div>
          <Pagination
            page={riskMeta.page}
            totalPages={riskMeta.totalPages}
            onPageChange={(p) =>
              setRiskQuery((prev) => ({ ...prev, page: p }))
            }
          />
        </div>
      )}

      {/* 로그인 이력 */}
      {activeTab === "login" && (
        <div className="space-y-4">
          <LoginHistoryFilter query={loginQuery} onChange={setLoginQuery} />
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <LoginHistoryTable history={history} isLoading={loginLoading} />
          </div>
          <Pagination
            page={loginMeta.page}
            totalPages={loginMeta.totalPages}
            onPageChange={(p) =>
              setLoginQuery((prev) => ({ ...prev, page: p }))
            }
          />
        </div>
      )}

      {/* 위험 알림 해결 다이얼로그 */}
      <RiskAlertResolveDialog
        alert={resolveTarget}
        open={resolveTarget !== null}
        onClose={() => setResolveTarget(null)}
        onConfirm={handleResolve}
        isLoading={resolving}
      />
    </div>
  );
}
