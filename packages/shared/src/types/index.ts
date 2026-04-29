// ============================================================
// PG System — 공유 타입 정의 (OST 원칙: 한 곳에서 정의)
// ============================================================

export * from './pg-gateway.types';
export * from './card-token.types';
export * from './acquirer-provider.types';

// ---- 공통 ----
export interface AuditFields {
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  deletedAt: Date | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// ---- 열거형 (Enums) ----
export type UserType = 'ADMIN' | 'AGENT' | 'MERCHANT';
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DORMANT' | 'WITHDRAWN';
export type MfaType = 'TOTP' | 'SMS' | 'EMAIL';
export type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'CASH';
export type TransactionType = 'PAYMENT' | 'CANCEL' | 'PARTIAL_CANCEL';
export type TransactionStatus = 'PENDING' | 'APPROVED' | 'FAILED' | 'CANCELLED';
export type AgentStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
export type SettlementStatus = 'CALCULATED' | 'CONFIRMED' | 'REMITTED' | 'COMPLETED';
export type ReconcileStatus = 'PENDING' | 'MATCHED' | 'MISMATCHED' | 'MANUAL';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskAlertStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'FALSE_POSITIVE';
export type SettlementCycle = 'D+1' | 'D+2' | 'D+3' | 'WEEKLY' | 'MONTHLY';

// ---- 사용자 ----
export interface User extends AuditFields {
  id: string;
  loginId: string;
  name: string;
  email: string | null;
  phone: string | null;
  userType: UserType;
  status: UserStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  orgId: string | null;
}

export interface UserMfa {
  id: string;
  userId: string;
  mfaType: MfaType;
  isVerified: boolean;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- 조직 ----
export interface Company extends AuditFields {
  id: string;
  businessNo: string;
  companyName: string;
  representative: string;
  businessType: 'CORPORATION' | 'INDIVIDUAL';
  businessCategory: string | null;
  address: string | null;
  zipcode: string | null;
  phone: string | null;
  email: string | null;
}

export interface Agent extends AuditFields {
  id: string;
  companyId: string;
  parentId: string | null;
  agentCode: string;
  agentName: string;
  treePath: string | null;
  treeDepth: number;
  status: AgentStatus;
  contractStartDate: Date | null;
  contractEndDate: Date | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
}

export interface Merchant extends AuditFields {
  id: string;
  companyId: string;
  agentId: string;
  merchantCode: string;
  merchantName: string;
  status: MerchantStatus;
  contractStartDate: Date | null;
  contractEndDate: Date | null;
  settlementCycle: SettlementCycle;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  quarterlyVolume: bigint;
}

export interface MerchantTerminal extends AuditFields {
  id: string;
  merchantId: string;
  tid: string;
  terminalName: string | null;
  paymentMethod: PaymentMethod;
  status: AgentStatus;
}

// ---- 수수료 ----
export interface CommissionBase {
  id: string;
  paymentMethod: PaymentMethod;
  cardCompany: string | null;
  commissionRate: string; // NUMERIC → string to preserve precision
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface AgentCommission extends CommissionBase {
  agentId: string;
}

export interface MerchantCommission extends CommissionBase {
  merchantId: string;
}

// ---- 거래 ----
export interface CardPaymentDetail {
  cardNoMasked: string;
  cardCompany: string;
  installmentMonths: number;
  approvalNo: string;
  acquirer: string;
}

export interface BankPaymentDetail {
  bankCode: string;
  bankName: string;
  accountNoMasked: string;
}

export interface VirtualAccountDetail {
  bankCode: string;
  accountNo: string;
  depositorName: string;
  dueDate: string;
}

export type PaymentDetail = CardPaymentDetail | BankPaymentDetail | VirtualAccountDetail;

export interface Transaction {
  id: string;
  tranNo: string;
  merchantId: string;
  terminalId: string | null;
  tranType: TransactionType;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  amount: bigint;
  feeAmount: bigint;
  netAmount: bigint;
  vatAmount: bigint;
  paymentDetail: PaymentDetail;
  originalTranId: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

// ---- 정산 ----
export interface Settlement {
  id: string;
  merchantId: string;
  settlementDate: Date;
  periodFrom: Date;
  periodTo: Date;
  totalAmount: bigint;
  totalFee: bigint;
  totalNet: bigint;
  deduction: bigint;
  payoutAmount: bigint;
  tranCount: number;
  cancelCount: number;
  status: SettlementStatus;
  remittedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

// ---- 보안/감사 ----
export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface RiskAlert {
  id: string;
  alertType: string;
  severity: RiskSeverity;
  merchantId: string | null;
  transactionId: string | null;
  description: string;
  status: RiskAlertStatus;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
}
