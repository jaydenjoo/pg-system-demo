/**
 * Demo용 mock 리스트 데이터.
 * 실제 백엔드 응답 형식과 동일한 snake_case + nested join 구조.
 * 타입 정의: apps/web/src/types/{merchant,agent,transaction,settlement,deposit}.ts
 */

// ============================================================
// Companies (가맹점/대리점이 속한 회사)
// ============================================================

export const MOCK_COMPANIES = [
  { id: 'co-001', company_name: '카페 모카', business_no: '123-45-67890', representative: '김철수' },
  { id: 'co-002', company_name: '서울 베이커리', business_no: '123-45-67891', representative: '이영희' },
  { id: 'co-003', company_name: '동대문 의류', business_no: '123-45-67892', representative: '박민수' },
  { id: 'co-004', company_name: '강남 헬스장', business_no: '123-45-67893', representative: '최지영' },
  { id: 'co-005', company_name: '제주 레스토랑', business_no: '123-45-67894', representative: '정은재' },
  { id: 'co-101', company_name: '서울대리점(주)', business_no: '777-11-22001', representative: '홍길동' },
  { id: 'co-102', company_name: '부산대리점(주)', business_no: '777-11-22002', representative: '강감찬' },
  { id: 'co-103', company_name: '인천대리점(주)', business_no: '777-11-22003', representative: '이순신' },
];

// ============================================================
// Agents (대리점)
// ============================================================

export const MOCK_AGENTS = [
  {
    id: 'agt-001',
    company_id: 'co-101',
    parent_agent_id: null,
    agent_code: 'A001',
    agent_name: '서울대리점',
    status: 'ACTIVE' as const,
    tree_path: '/agt-001',
    tree_depth: 1,
    contract_start_date: '2025-11-01',
    contract_end_date: '2026-12-31',
    bank_name: '신한은행',
    bank_account: '110-001-001001',
    bank_holder: '홍길동',
    created_at: '2025-11-01T00:00:00.000Z',
    updated_at: '2025-11-01T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    parent_agent: null,
    companies: MOCK_COMPANIES[5],
  },
  {
    id: 'agt-002',
    company_id: 'co-102',
    parent_agent_id: null,
    agent_code: 'A002',
    agent_name: '부산대리점',
    status: 'ACTIVE' as const,
    tree_path: '/agt-002',
    tree_depth: 1,
    contract_start_date: '2025-11-15',
    contract_end_date: '2026-12-31',
    bank_name: '국민은행',
    bank_account: '110-002-002002',
    bank_holder: '강감찬',
    created_at: '2025-11-15T00:00:00.000Z',
    updated_at: '2025-11-15T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    parent_agent: null,
    companies: MOCK_COMPANIES[6],
  },
  {
    id: 'agt-003',
    company_id: 'co-103',
    parent_agent_id: null,
    agent_code: 'A003',
    agent_name: '인천대리점',
    status: 'ACTIVE' as const,
    tree_path: '/agt-003',
    tree_depth: 1,
    contract_start_date: '2025-12-01',
    contract_end_date: '2026-12-31',
    bank_name: '우리은행',
    bank_account: '110-003-003003',
    bank_holder: '이순신',
    created_at: '2025-12-01T00:00:00.000Z',
    updated_at: '2025-12-01T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    parent_agent: null,
    companies: MOCK_COMPANIES[7],
  },
];

// 가맹점 페이지 상세에 필요한 agent join (id+name+code만)
const agentJoin = (i: number) => ({
  id: MOCK_AGENTS[i].id,
  agent_name: MOCK_AGENTS[i].agent_name,
  agent_code: MOCK_AGENTS[i].agent_code,
});

// ============================================================
// Merchants (가맹점)
// ============================================================

export const MOCK_MERCHANTS = [
  {
    id: 'mch-001',
    company_id: 'co-001',
    agent_id: 'agt-001',
    merchant_code: 'M001',
    merchant_name: '카페 모카',
    status: 'ACTIVE' as const,
    settlement_cycle: 'D+1' as const,
    contract_start_date: '2025-12-01',
    contract_end_date: '2026-12-31',
    bank_name: '신한은행',
    bank_account: '111-001-001001',
    bank_holder: '김철수',
    created_at: '2025-12-01T00:00:00.000Z',
    updated_at: '2025-12-01T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    agents: agentJoin(0),
    companies: MOCK_COMPANIES[0],
  },
  {
    id: 'mch-002',
    company_id: 'co-002',
    agent_id: 'agt-001',
    merchant_code: 'M002',
    merchant_name: '서울 베이커리',
    status: 'ACTIVE' as const,
    settlement_cycle: 'D+2' as const,
    contract_start_date: '2025-12-05',
    contract_end_date: '2026-12-31',
    bank_name: '국민은행',
    bank_account: '111-002-002002',
    bank_holder: '이영희',
    created_at: '2025-12-05T00:00:00.000Z',
    updated_at: '2025-12-05T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    agents: agentJoin(0),
    companies: MOCK_COMPANIES[1],
  },
  {
    id: 'mch-003',
    company_id: 'co-003',
    agent_id: 'agt-002',
    merchant_code: 'M003',
    merchant_name: '동대문 의류',
    status: 'ACTIVE' as const,
    settlement_cycle: 'WEEKLY' as const,
    contract_start_date: '2025-12-10',
    contract_end_date: '2026-12-31',
    bank_name: '우리은행',
    bank_account: '111-003-003003',
    bank_holder: '박민수',
    created_at: '2025-12-10T00:00:00.000Z',
    updated_at: '2025-12-10T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    agents: agentJoin(1),
    companies: MOCK_COMPANIES[2],
  },
  {
    id: 'mch-004',
    company_id: 'co-004',
    agent_id: 'agt-002',
    merchant_code: 'M004',
    merchant_name: '강남 헬스장',
    status: 'PENDING' as const,
    settlement_cycle: 'D+3' as const,
    contract_start_date: '2026-01-15',
    contract_end_date: null,
    bank_name: 'KEB하나은행',
    bank_account: '111-004-004004',
    bank_holder: '최지영',
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-01-15T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    agents: agentJoin(1),
    companies: MOCK_COMPANIES[3],
  },
  {
    id: 'mch-005',
    company_id: 'co-005',
    agent_id: 'agt-003',
    merchant_code: 'M005',
    merchant_name: '제주 레스토랑',
    status: 'ACTIVE' as const,
    settlement_cycle: 'MONTHLY' as const,
    contract_start_date: '2026-02-01',
    contract_end_date: '2027-01-31',
    bank_name: '농협은행',
    bank_account: '111-005-005005',
    bank_holder: '정은재',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    agents: agentJoin(2),
    companies: MOCK_COMPANIES[4],
  },
];

const merchantJoin = (i: number) => ({
  id: MOCK_MERCHANTS[i].id,
  merchant_name: MOCK_MERCHANTS[i].merchant_name,
  merchant_code: MOCK_MERCHANTS[i].merchant_code,
});

// ============================================================
// Transactions (거래)
// ============================================================

const TODAY = new Date().toISOString().split('T')[0];
const todayAt = (hh: number, mm: number) => new Date(`${TODAY}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`).toISOString();
const TX_STATUS = ['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'CANCELLED', 'PENDING', 'FAILED'] as const;
const TX_METHOD = ['CARD', 'CARD', 'BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'CASH'] as const;

export const MOCK_TRANSACTIONS = Array.from({ length: 30 }, (_, i) => {
  const merchantIdx = i % MOCK_MERCHANTS.length;
  const status = TX_STATUS[i % TX_STATUS.length];
  const method = TX_METHOD[i % TX_METHOD.length];
  const amount = 10000 + (i * 7345) % 95000;
  const fee = Math.floor(amount * 0.029);
  const vat = Math.floor(fee * 0.1);
  const net = amount - fee - vat;
  const hour = (8 + (i % 12));
  const minute = (i * 7) % 60;

  return {
    id: `tx-${String(i + 1).padStart(4, '0')}`,
    merchant_id: MOCK_MERCHANTS[merchantIdx].id,
    tran_no: `T${TODAY.replace(/-/g, '')}${String(i + 1001).padStart(6, '0')}`,
    order_no: `ORD-${TODAY.replace(/-/g, '')}-${String(i + 1).padStart(4, '0')}`,
    order_name: ['아메리카노 2잔', '식빵 + 우유', '셔츠 1벌', '월간이용권', '세트메뉴 A', null][i % 6],
    amount,
    fee_amount: fee,
    net_amount: net,
    vat_amount: vat,
    status,
    payment_method: method,
    tran_type: 'PAYMENT' as const,
    terminal_id: `TERM-${(merchantIdx + 1).toString().padStart(3, '0')}`,
    payment_detail: method === 'CARD' ? { card_company: ['신한카드', '국민카드', '삼성카드'][i % 3], card_number_masked: '4012-****-****-1234' } : null,
    approved_at: status === 'APPROVED' || status === 'CANCELLED' ? todayAt(hour, minute) : null,
    cancelled_at: status === 'CANCELLED' ? todayAt(hour + 1, minute) : null,
    created_at: todayAt(hour, minute),
    updated_at: todayAt(hour, minute),
    merchants: merchantJoin(merchantIdx),
    merchant_terminals: { id: `term-${merchantIdx + 1}`, terminal_id: `TERM-${(merchantIdx + 1).toString().padStart(3, '0')}`, terminal_name: `${MOCK_MERCHANTS[merchantIdx].merchant_name} 단말기` },
    original_transaction: null,
    cancel_transactions: [],
  };
});

// ============================================================
// Settlements (정산)
// ============================================================

const STL_STATUS = ['CALCULATED', 'CONFIRMED', 'REMITTED', 'COMPLETED'] as const;

export const MOCK_SETTLEMENTS = MOCK_MERCHANTS.flatMap((merchant, mi) =>
  Array.from({ length: 3 }, (_, di) => {
    const settleDate = new Date(Date.now() - di * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const totalAmount = 1500000 + mi * 200000 + di * 100000;
    const totalFee = Math.floor(totalAmount * 0.029);
    const deduction = di === 0 ? 0 : Math.floor(totalAmount * 0.005);
    const status = STL_STATUS[(mi + di) % STL_STATUS.length];

    return {
      id: `stl-${merchant.id}-${di + 1}`,
      merchant_id: merchant.id,
      settlement_date: settleDate,
      period_from: settleDate,
      period_to: settleDate,
      total_amount: totalAmount,
      total_fee: totalFee,
      total_net: totalAmount - totalFee,
      deduction,
      payout_amount: totalAmount - totalFee - deduction,
      tran_count: 50 + mi * 20 + di * 10,
      cancel_count: di,
      status,
      remitted_at: status === 'REMITTED' || status === 'COMPLETED' ? `${settleDate}T15:00:00.000Z` : null,
      created_at: `${settleDate}T08:00:00.000Z`,
      updated_at: `${settleDate}T16:00:00.000Z`,
      merchants: merchantJoin(mi),
    };
  }),
);

// ============================================================
// Agent Settlements (대리점 수수료 정산)
// ============================================================

export const MOCK_AGENT_SETTLEMENTS = MOCK_AGENTS.flatMap((agent, ai) =>
  Array.from({ length: 3 }, (_, di) => {
    const settleDate = new Date(Date.now() - di * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const totalCommission = 800000 + ai * 150000 + di * 50000;
    const status = STL_STATUS[(ai + di) % STL_STATUS.length];
    return {
      id: `astl-${agent.id}-${di + 1}`,
      agent_id: agent.id,
      settlement_date: settleDate,
      period_from: settleDate,
      period_to: settleDate,
      total_commission: totalCommission,
      tran_count: 30 + ai * 15 + di * 5,
      status,
      created_at: `${settleDate}T08:00:00.000Z`,
      updated_at: `${settleDate}T16:00:00.000Z`,
      agents: { id: agent.id, agent_name: agent.agent_name, agent_code: agent.agent_code },
    };
  }),
);

// ============================================================
// Deposits (입금)
// ============================================================

const DEP_STATUS = ['MATCHED', 'PENDING', 'MISMATCHED', 'MANUAL'] as const;

export const MOCK_DEPOSITS = Array.from({ length: 12 }, (_, i) => {
  const date = new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString().split('T')[0];
  const amount = 500000 + (i * 234567) % 9500000;
  const status = DEP_STATUS[i % DEP_STATUS.length];
  const matched = status === 'MATCHED' ? amount : status === 'MANUAL' ? Math.floor(amount * 0.7) : 0;
  return {
    id: `dep-${String(i + 1).padStart(4, '0')}`,
    deposit_date: date,
    source: ['신한은행', '국민은행', '우리은행', 'KEB하나은행'][i % 4],
    amount,
    matched_amount: matched,
    unmatched_amount: amount - matched,
    reconcile_status: status,
    created_at: `${date}T09:00:00.000Z`,
    updated_at: `${date}T09:30:00.000Z`,
    created_by: 'mock-admin-001',
    updated_by: 'mock-admin-001',
    deposit_transactions: status === 'MATCHED' || status === 'MANUAL' ? [
      {
        id: `dt-${String(i + 1).padStart(4, '0')}`,
        deposit_id: `dep-${String(i + 1).padStart(4, '0')}`,
        transaction_id: `tx-${String((i % 25) + 1).padStart(4, '0')}`,
        matched_amount: matched,
        created_at: `${date}T09:30:00.000Z`,
        transactions: {
          id: `tx-${String((i % 25) + 1).padStart(4, '0')}`,
          tran_no: MOCK_TRANSACTIONS[i % 25]?.tran_no ?? null,
          amount: MOCK_TRANSACTIONS[i % 25]?.amount ?? 0,
          merchant_id: MOCK_TRANSACTIONS[i % 25]?.merchant_id ?? '',
          merchants: { merchant_name: MOCK_TRANSACTIONS[i % 25]?.merchants?.merchant_name ?? '' },
        },
      },
    ] : [],
  };
});

// ============================================================
// Dashboard Summary (오늘 통계)
// ============================================================

const todayApproved = MOCK_TRANSACTIONS.filter((t) => t.status === 'APPROVED');
const todayCancelled = MOCK_TRANSACTIONS.filter((t) => t.status === 'CANCELLED');
const todayTransactionAmount = todayApproved.reduce((s, t) => s + t.amount, 0);
const todaySettleAmount = MOCK_SETTLEMENTS.filter((s) => s.settlement_date === TODAY).reduce((sum, s) => sum + s.payout_amount, 0);
const todayDepositAmount = MOCK_DEPOSITS.filter((d) => d.deposit_date === TODAY).reduce((sum, d) => sum + d.amount, 0);

export const MOCK_DASHBOARD_SUMMARY = {
  totalMerchants: MOCK_MERCHANTS.filter((m) => m.status === 'ACTIVE').length,
  totalAgents: MOCK_AGENTS.filter((a) => a.status === 'ACTIVE').length,
  transactionCount: todayApproved.length + todayCancelled.length,
  totalTransactionAmount: String(todayTransactionAmount),
  totalSettlementAmount: String(todaySettleAmount || 1126480200),
  totalDepositAmount: String(todayDepositAmount || 1098230400),
  pendingSettlementCount: MOCK_SETTLEMENTS.filter((s) => s.status === 'CALCULATED').length,
  unmatchedDepositCount: MOCK_DEPOSITS.filter((d) => d.reconcile_status === 'PENDING' || d.reconcile_status === 'MISMATCHED').length,
};

export const MOCK_TRANSACTION_STATS = {
  byStatus: [
    { status: 'APPROVED', count: todayApproved.length, totalAmount: String(todayTransactionAmount) },
    { status: 'CANCELLED', count: todayCancelled.length, totalAmount: String(todayCancelled.reduce((s, t) => s + t.amount, 0)) },
    { status: 'PENDING', count: MOCK_TRANSACTIONS.filter((t) => t.status === 'PENDING').length, totalAmount: '0' },
    { status: 'FAILED', count: MOCK_TRANSACTIONS.filter((t) => t.status === 'FAILED').length, totalAmount: String(MOCK_TRANSACTIONS.filter((t) => t.status === 'FAILED').reduce((s, t) => s + t.amount, 0)) },
  ],
  byPaymentMethod: ['CARD', 'BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'CASH'].map((pm) => {
    const txs = MOCK_TRANSACTIONS.filter((t) => t.payment_method === pm && t.status === 'APPROVED');
    return { paymentMethod: pm, count: txs.length, totalAmount: String(txs.reduce((s, t) => s + t.amount, 0)) };
  }),
};

export const MOCK_SETTLEMENT_STATS = STL_STATUS.map((status) => {
  const stls = MOCK_SETTLEMENTS.filter((s) => s.status === status);
  return { status, count: stls.length, totalNetAmount: String(stls.reduce((sum, s) => sum + s.total_net, 0)) };
});

export const MOCK_DAILY_TREND = Array.from({ length: 7 }, (_, i) => {
  const date = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const count = 600 + (i * 137) % 350;
  const amount = String(40000000 + (i * 8123456) % 35000000);
  return { date, count, amount };
});

export const MOCK_TOP_MERCHANTS = MOCK_MERCHANTS.slice(0, 5).map((m, i) => ({
  merchantId: m.id,
  merchantName: m.merchant_name,
  merchantCode: m.merchant_code,
  totalAmount: String(120000000 - i * 18000000),
  transactionCount: 1842 - i * 320,
}));

export const MOCK_TOP_AGENTS = MOCK_AGENTS.map((a, i) => ({
  agentId: a.id,
  agentName: a.agent_name,
  agentCode: a.agent_code,
  totalCommission: String(12000000 - i * 3500000),
  settlementCount: 248 - i * 80,
}));

// ============================================================
// PG Margins
// ============================================================

export const MOCK_PG_MARGINS = MOCK_MERCHANTS.map((m, i) => ({
  id: `pgm-${String(i + 1).padStart(3, '0')}`,
  merchant_id: m.id,
  merchant_name: m.merchant_name,
  merchant_code: m.merchant_code,
  card_rate: ['2.8', '2.7', '2.9', '3.0', '2.85'][i],
  bank_rate: ['0.8', '0.8', '0.9', '1.0', '0.85'][i],
  vat_rate: '0.1',
  effective_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  merchants: merchantJoin(i),
}));

// ============================================================
// System Codes
// ============================================================

export const MOCK_SYSTEM_CODES = [
  { id: 'sc-001', code_group: 'PAYMENT_METHOD', code: 'CARD', name: '카드결제', description: '신용카드/체크카드', sort_order: 1, active: true },
  { id: 'sc-002', code_group: 'PAYMENT_METHOD', code: 'BANK_TRANSFER', name: '계좌이체', description: '실시간 계좌이체', sort_order: 2, active: true },
  { id: 'sc-003', code_group: 'PAYMENT_METHOD', code: 'VIRTUAL_ACCOUNT', name: '가상계좌', description: '가상계좌 입금', sort_order: 3, active: true },
  { id: 'sc-004', code_group: 'PAYMENT_METHOD', code: 'CASH', name: '현금', description: '현금 결제', sort_order: 4, active: true },
  { id: 'sc-005', code_group: 'TRANSACTION_STATUS', code: 'APPROVED', name: '승인', description: '결제 승인 완료', sort_order: 1, active: true },
  { id: 'sc-006', code_group: 'TRANSACTION_STATUS', code: 'CANCELLED', name: '취소', description: '결제 취소', sort_order: 2, active: true },
  { id: 'sc-007', code_group: 'TRANSACTION_STATUS', code: 'FAILED', name: '실패', description: '결제 실패', sort_order: 3, active: true },
  { id: 'sc-008', code_group: 'TRANSACTION_STATUS', code: 'PENDING', name: '대기', description: '승인 대기', sort_order: 4, active: true },
  { id: 'sc-009', code_group: 'SETTLEMENT_STATUS', code: 'CALCULATED', name: '계산완료', description: '정산 계산 완료', sort_order: 1, active: true },
  { id: 'sc-010', code_group: 'SETTLEMENT_STATUS', code: 'CONFIRMED', name: '확정', description: '정산 확정', sort_order: 2, active: true },
  { id: 'sc-011', code_group: 'SETTLEMENT_STATUS', code: 'REMITTED', name: '송금완료', description: '송금 완료', sort_order: 3, active: true },
  { id: 'sc-012', code_group: 'SETTLEMENT_STATUS', code: 'COMPLETED', name: '완료', description: '정산 완료', sort_order: 4, active: true },
];

// ============================================================
// Users / Roles (관리자 화면용)
// ============================================================

export const MOCK_USERS_LIST = [
  { id: 'mock-admin-001', login_id: 'admin', name: '시스템 관리자', email: 'admin@pg-demo.local', user_type: 'ADMIN' as const, status: 'ACTIVE' as const, mfa_enabled: false, last_login_at: '2026-04-29T08:30:00.000Z', created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'mock-agent-001', login_id: 'agent_test', name: '테스트 대리점', email: 'agent@pg-demo.local', user_type: 'AGENT' as const, status: 'ACTIVE' as const, mfa_enabled: false, last_login_at: '2026-04-28T11:15:00.000Z', created_at: '2026-01-02T00:00:00.000Z' },
  { id: 'mock-merchant-001', login_id: 'merchant_test', name: '테스트 가맹점', email: 'merchant@pg-demo.local', user_type: 'MERCHANT' as const, status: 'ACTIVE' as const, mfa_enabled: false, last_login_at: '2026-04-29T08:45:00.000Z', created_at: '2026-01-03T00:00:00.000Z' },
  { id: 'mock-staff-001', login_id: 'staff1', name: '운영팀 김운영', email: 'staff1@pg-demo.local', user_type: 'ADMIN' as const, status: 'ACTIVE' as const, mfa_enabled: true, last_login_at: '2026-04-28T17:00:00.000Z', created_at: '2026-02-01T00:00:00.000Z' },
  { id: 'mock-staff-002', login_id: 'staff2', name: '운영팀 박관리', email: 'staff2@pg-demo.local', user_type: 'ADMIN' as const, status: 'LOCKED' as const, mfa_enabled: false, last_login_at: '2026-03-15T10:00:00.000Z', created_at: '2026-02-15T00:00:00.000Z' },
];

export const MOCK_ROLES = [
  { id: 'role-001', name: 'SUPER_ADMIN', description: '전체 권한', user_type: 'ADMIN' as const, role_permissions: [] },
  { id: 'role-002', name: 'OPERATION_ADMIN', description: '운영 관리자', user_type: 'ADMIN' as const, role_permissions: [] },
  { id: 'role-003', name: 'SETTLEMENT_ADMIN', description: '정산 관리자', user_type: 'ADMIN' as const, role_permissions: [] },
  { id: 'role-004', name: 'READ_ONLY_ADMIN', description: '조회 전용', user_type: 'ADMIN' as const, role_permissions: [] },
  { id: 'role-005', name: 'AGENT_OWNER', description: '대리점 대표', user_type: 'AGENT' as const, role_permissions: [] },
  { id: 'role-006', name: 'AGENT_STAFF', description: '대리점 직원', user_type: 'AGENT' as const, role_permissions: [] },
  { id: 'role-007', name: 'MERCHANT_OWNER', description: '가맹점 대표', user_type: 'MERCHANT' as const, role_permissions: [] },
  { id: 'role-008', name: 'MERCHANT_STAFF', description: '가맹점 직원', user_type: 'MERCHANT' as const, role_permissions: [] },
];

// ============================================================
// Pagination helpers
// ============================================================

export function paginate<T>(items: T[], page = 1, limit = 20): {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
} {
  const safePage = Math.max(1, Math.floor(Number(page)) || 1);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 20));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const start = (safePage - 1) * safeLimit;
  const end = start + safeLimit;
  return {
    data: items.slice(start, end),
    meta: { total, page: safePage, limit: safeLimit, totalPages },
  };
}

export function readPagination(searchParams: URLSearchParams): { page: number; limit: number } {
  const pageRaw = searchParams.get('page') ?? '1';
  const limitRaw = searchParams.get('limit') ?? '20';
  const page = Math.max(1, parseInt(pageRaw, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 20));
  return { page, limit };
}

export function applySearch<T extends { merchant_name?: string; merchant_code?: string; agent_name?: string; agent_code?: string }>(
  items: T[],
  search?: string | null,
): T[] {
  if (!search) return items;
  const q = search.trim().toLowerCase();
  if (q === '') return items;
  return items.filter((item) => {
    const fields = [item.merchant_name, item.merchant_code, item.agent_name, item.agent_code].filter(Boolean) as string[];
    return fields.some((f) => f.toLowerCase().includes(q));
  });
}

export function applyStatusFilter<T extends { status?: string }>(items: T[], status?: string | null): T[] {
  if (!status) return items;
  return items.filter((item) => item.status === status);
}
