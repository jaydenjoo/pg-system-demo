export type AgentStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface Agent {
  id: string;
  company_id: string;
  parent_agent_id: string | null;
  agent_code: string;
  agent_name: string;
  status: AgentStatus;
  tree_path: string | null;
  tree_depth: number;
  contract_start_date: string | null;
  contract_end_date: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_holder: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  parent_agent?: {
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

export interface SubAgent {
  id: string;
  agent_code: string;
  agent_name: string;
  status: AgentStatus;
  tree_depth: number;
  parent_agent_id: string | null;
  created_at: string;
}

export interface CreateAgentForm {
  companyId: string;
  agentCode: string;
  agentName: string;
  parentAgentId?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
}

/** Backend UpdateAgentDto only accepts agentName and status */
export interface UpdateAgentForm {
  agentName?: string;
  status?: AgentStatus;
}

export interface ChangeAgentStatusForm {
  status: AgentStatus;
  reason?: string;
}

export interface AgentQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  parentAgentId?: string;
}
