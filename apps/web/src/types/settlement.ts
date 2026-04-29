export type SettlementStatus = 'CALCULATED' | 'CONFIRMED' | 'REMITTED' | 'COMPLETED';

export interface Settlement {
  id: string;
  merchant_id: string;
  settlement_date: string;
  period_from: string;
  period_to: string;
  total_amount: number;
  total_fee: number;
  total_net: number;
  deduction: number;
  payout_amount: number;
  tran_count: number;
  cancel_count: number;
  status: SettlementStatus;
  remitted_at: string | null;
  created_at: string;
  updated_at: string;
  merchants?: {
    id: string;
    merchant_name: string;
    merchant_code: string;
  } | null;
}

export interface AgentSettlement {
  id: string;
  agent_id: string;
  settlement_date: string;
  period_from: string;
  period_to: string;
  total_commission: number;
  tran_count: number;
  status: SettlementStatus;
  created_at: string;
  updated_at: string;
  agents?: {
    id: string;
    agent_name: string;
    agent_code: string;
  } | null;
}

export interface SettlementQuery {
  page?: number;
  limit?: number;
  merchantId?: string;
  agentId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface AgentSettlementQuery {
  page?: number;
  limit?: number;
  agentId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface CalculateSettlementForm {
  settlementDate: string;
  periodFrom: string;
  periodTo: string;
}
