"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  Merchant,
  MerchantStatus,
  SettlementCycle,
} from "@/types/merchant";

interface MerchantDetailProps {
  merchant: Merchant;
}

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "danger";

const STATUS_LABELS: Record<MerchantStatus, string> = {
  PENDING: "심사중",
  ACTIVE: "활성",
  SUSPENDED: "정지",
  TERMINATED: "해지",
};

const STATUS_VARIANTS: Record<MerchantStatus, BadgeVariant> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  TERMINATED: "default",
};

const CYCLE_LABELS: Record<SettlementCycle, string> = {
  "D+1": "D+1",
  "D+2": "D+2",
  "D+3": "D+3",
  WEEKLY: "주정산",
  MONTHLY: "월정산",
};

export function MerchantDetail({ merchant }: MerchantDetailProps) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">기본 정보</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">가맹점 코드</dt>
            <dd className="font-mono font-medium text-gray-900">
              {merchant.merchant_code}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">가맹점명</dt>
            <dd className="font-medium text-gray-900">
              {merchant.merchant_name}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>
              <Badge variant={STATUS_VARIANTS[merchant.status]}>
                {STATUS_LABELS[merchant.status]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">정산 주기</dt>
            <dd className="font-medium text-gray-900">
              {merchant.settlement_cycle
                ? CYCLE_LABELS[merchant.settlement_cycle]
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">소속 대리점</dt>
            <dd className="font-medium text-gray-900">
              {merchant.agents
                ? `[${merchant.agents.agent_code}] ${merchant.agents.agent_name}`
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">등록일</dt>
            <dd className="font-medium text-gray-900">
              {new Date(merchant.created_at).toLocaleString("ko-KR")}
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
              {merchant.contract_start_date ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">계약 종료일</dt>
            <dd className="font-medium text-gray-900">
              {merchant.contract_end_date ?? "-"}
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
              {merchant.bank_name ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">계좌번호</dt>
            <dd className="font-medium text-gray-900">
              {merchant.bank_account ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">예금주</dt>
            <dd className="font-medium text-gray-900">
              {merchant.bank_holder ?? "-"}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
