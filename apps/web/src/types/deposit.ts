export type ReconcileStatus = 'PENDING' | 'MATCHED' | 'MISMATCHED' | 'MANUAL';

export interface MatchedTransaction {
  id: string;
  deposit_id: string;
  transaction_id: string;
  matched_amount: number;
  created_at: string;
  transactions?: {
    id: string;
    tran_no: string | null;
    amount: number;
    merchant_id: string;
    merchants?: { merchant_name: string } | null;
  } | null;
}

export interface Deposit {
  id: string;
  deposit_date: string;
  source: string;
  amount: number;
  matched_amount: number;
  unmatched_amount: number;
  reconcile_status: ReconcileStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deposit_transactions?: MatchedTransaction[];
}

export interface DepositQuery {
  page?: number;
  limit?: number;
  source?: string;
  reconcileStatus?: ReconcileStatus;
  startDate?: string;
  endDate?: string;
}

export interface CreateDepositForm {
  depositDate: string;
  source: string;
  amount: number;
}

export interface ManualMatchForm {
  transactionId: string;
  matchedAmount: number;
}
