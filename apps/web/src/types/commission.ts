export type CommissionEntityType = 'agent' | 'merchant';

export interface PgMargin {
  id: string;
  payment_method: string;
  card_company: string | null;
  margin_rate: string;
  min_fee: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface AgentCommission {
  id: string;
  agent_id: string;
  payment_method: string;
  card_company: string | null;
  commission_rate: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  agents?: { agent_name: string; agent_code: string } | null;
}

export interface MerchantCommission {
  id: string;
  merchant_id: string;
  payment_method: string;
  card_company: string | null;
  commission_rate: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  merchants?: { merchant_name: string; merchant_code: string } | null;
}

/** Backend returns { entityType, entityId, data: CommissionRecord[] } */
export interface CommissionHistoryResponse {
  entityType: CommissionEntityType;
  entityId: string;
  data: CommissionRecord[];
}

export interface CommissionRecord {
  id: string;
  payment_method: string;
  card_company: string | null;
  commission_rate: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  created_by: string;
}

export interface SetPgMarginForm {
  paymentMethod: string;
  cardCompany?: string;
  marginRate: string;
  minFee?: number;
}

export interface SetAgentCommissionForm {
  paymentMethod: string;
  cardCompany?: string;
  commissionRate: string;
}

export interface SetMerchantCommissionForm {
  paymentMethod: string;
  cardCompany?: string;
  commissionRate: string;
}

/** 3계층 비교용 집계 */
export interface CommissionTier {
  cardCompany: string;
  paymentMethod: string;
  pgRate: number;
  agentRate: number | null;
  merchantRate: number | null;
  isValid: boolean;
}
