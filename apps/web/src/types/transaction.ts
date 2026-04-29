export type TransactionStatus = 'PENDING' | 'APPROVED' | 'FAILED' | 'CANCELLED';
export type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'CASH';
export type TransactionType = 'PAYMENT' | 'CANCEL' | 'PARTIAL_CANCEL';

export interface Transaction {
  id: string;
  merchant_id: string;
  tran_no: string;
  order_no: string;
  order_name: string | null;
  amount: number;
  fee_amount: number;
  net_amount: number;
  vat_amount: number;
  status: TransactionStatus;
  payment_method: PaymentMethod | null;
  tran_type: TransactionType;
  terminal_id: string | null;
  payment_detail: Record<string, unknown> | null;
  approved_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  merchants?: {
    id: string;
    merchant_name: string;
    merchant_code: string;
  } | null;
  merchant_terminals?: {
    id: string;
    terminal_id: string;
    terminal_name: string;
  } | null;
  original_transaction?: Transaction | null;
  cancel_transactions?: Transaction[];
}

export interface TransactionQuery {
  page?: number;
  limit?: number;
  search?: string;
  merchantId?: string;
  agentId?: string;
  status?: string;
  paymentMethod?: string;
  tranType?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateTransactionForm {
  merchantId: string;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  amount: number;
  orderNo: string;
  orderName?: string;
  terminalId?: string;
  feeAmount?: number;
  paymentDetail?: Record<string, unknown>;
}

export interface CancelTransactionForm {
  reason: string;
}
