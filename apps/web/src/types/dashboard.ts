/** 백엔드 GET /dashboard/summary 응답 */
export interface DashboardSummary {
  totalMerchants: number;
  totalAgents: number;
  transactionCount: number;
  totalTransactionAmount: string;
  totalSettlementAmount: string;
  totalDepositAmount: string;
  pendingSettlementCount: number;
  unmatchedDepositCount: number;
}

/** 백엔드 GET /dashboard/transaction-stats → byStatus / byPaymentMethod 각 항목 */
export interface TransactionStatItem {
  status: string;
  count: number;
  totalAmount: string;
}

export interface PaymentMethodStatItem {
  paymentMethod: string;
  count: number;
  totalAmount: string;
}

/** 백엔드 응답은 nested object */
export interface TransactionStatsResponse {
  byStatus: TransactionStatItem[];
  byPaymentMethod: PaymentMethodStatItem[];
}

/** 백엔드 GET /dashboard/settlement-stats 각 항목 */
export interface SettlementStat {
  status: string;
  count: number;
  totalNetAmount: string;
}

/** 백엔드 GET /dashboard/daily-trend 각 항목 */
export interface DailyTrend {
  date: string;
  count: number;
  amount: string;
}

/** 백엔드 GET /dashboard/top-merchants 각 항목 */
export interface TopMerchant {
  merchantId: string;
  merchantName: string;
  merchantCode: string;
  totalAmount: string;
  transactionCount: number;
}

/** 백엔드 GET /dashboard/top-agents 각 항목 */
export interface TopAgent {
  agentId: string;
  agentName: string;
  agentCode: string;
  totalCommission: string;
  settlementCount: number;
}

export interface DashboardQuery {
  startDate?: string;
  endDate?: string;
  merchantId?: string;
  agentId?: string;
}
