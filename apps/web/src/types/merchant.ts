export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
export type SettlementCycle = 'D+1' | 'D+2' | 'D+3' | 'WEEKLY' | 'MONTHLY';

export interface Merchant {
  id: string;
  company_id: string;
  agent_id: string;
  merchant_code: string;
  merchant_name: string;
  status: MerchantStatus;
  settlement_cycle: SettlementCycle | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_holder: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  agents?: {
    id: string;
    agent_name: string;
    agent_code: string;
  } | null;
  companies?: {
    id: string;
    company_name: string;
    business_no: string;
    representative: string;
  } | null;
}

export interface CreateMerchantForm {
  companyId: string;
  agentId: string;
  merchantCode: string;
  merchantName: string;
  settlementCycle?: SettlementCycle;
  contractStartDate?: string;
  contractEndDate?: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
}

export interface UpdateMerchantForm {
  merchantName?: string;
  status?: MerchantStatus;
  settlementCycle?: SettlementCycle;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
}

export interface ChangeMerchantStatusForm {
  status: MerchantStatus;
  reason?: string;
}

export interface MerchantQuery {
  page?: number;
  limit?: number;
  search?: string;
  agentId?: string;
  status?: string;
}
