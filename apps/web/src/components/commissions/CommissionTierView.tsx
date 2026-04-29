"use client";

import type { PgMargin, AgentCommission, MerchantCommission, CommissionTier } from "@/types/commission";

interface Props {
  pgMargins: PgMargin[];
  agentCommissions: AgentCommission[];
  merchantCommissions: MerchantCommission[];
}

function buildTiers(
  pgMargins: PgMargin[],
  agentCommissions: AgentCommission[],
  merchantCommissions: MerchantCommission[],
): CommissionTier[] {
  const keys = new Set<string>();

  const makeKey = (pm: string, cc: string): string => `${pm}::${cc}`;

  pgMargins.forEach((m) => keys.add(makeKey(m.payment_method, m.card_company ?? "공통")));
  agentCommissions.forEach((m) => keys.add(makeKey(m.payment_method, m.card_company ?? "공통")));
  merchantCommissions.forEach((m) => keys.add(makeKey(m.payment_method, m.card_company ?? "공통")));

  return Array.from(keys).map((key) => {
    const [paymentMethod, cardCompany] = key.split("::");

    const pg = pgMargins.find(
      (m) => m.payment_method === paymentMethod && (m.card_company ?? "공통") === cardCompany,
    );
    const agent = agentCommissions.find(
      (m) => m.payment_method === paymentMethod && (m.card_company ?? "공통") === cardCompany,
    );
    const merchant = merchantCommissions.find(
      (m) => m.payment_method === paymentMethod && (m.card_company ?? "공통") === cardCompany,
    );

    const pgRate = Number(pg?.margin_rate ?? "0");
    const agentRate = agent ? Number(agent.commission_rate) : null;
    const merchantRate = merchant ? Number(merchant.commission_rate) : null;

    const isValid =
      (agentRate === null || agentRate >= pgRate) &&
      (merchantRate === null ||
        (agentRate !== null ? merchantRate >= agentRate : merchantRate >= pgRate));

    return { cardCompany, paymentMethod, pgRate, agentRate, merchantRate, isValid };
  });
}

export function CommissionTierView({
  pgMargins,
  agentCommissions,
  merchantCommissions,
}: Props) {
  const tiers = buildTiers(pgMargins, agentCommissions, merchantCommissions);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">결제수단</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">카드사</th>
            <th className="px-4 py-3 text-right font-medium text-blue-700">
              PG 마진율
            </th>
            <th className="px-4 py-3 text-right font-medium text-indigo-700">
              대리점 요율
            </th>
            <th className="px-4 py-3 text-right font-medium text-purple-700">
              가맹점 요율
            </th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tiers.map((tier) => (
            <tr key={`${tier.paymentMethod}::${tier.cardCompany}`} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{tier.paymentMethod}</td>
              <td className="px-4 py-3 text-gray-900">{tier.cardCompany}</td>
              <td className="px-4 py-3 text-right font-semibold text-blue-700">
                {tier.pgRate.toFixed(2)}%
              </td>
              <td className="px-4 py-3 text-right font-semibold text-indigo-700">
                {tier.agentRate !== null ? `${tier.agentRate.toFixed(2)}%` : "—"}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-purple-700">
                {tier.merchantRate !== null
                  ? `${tier.merchantRate.toFixed(2)}%`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-center">
                {tier.isValid ? (
                  <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    정상
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    역전
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
        PG 마진율 ≤ 대리점 요율 ≤ 가맹점 요율 순서여야 합니다.
      </div>
    </div>
  );
}
